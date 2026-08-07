import { transaction } from '~~/server/utils/db'
import type { GooglePmaxRemediationTaskDraft } from '~~/server/utils/googlePmaxRemediationTasks'

export interface GooglePmaxRemediationTaskContext {
  launchId: string
  configVersion: number
  configHash: string
  briefId: string
  projectId: string | null
  assigneeId: string
  departmentId: string
  statusId: string
}

export interface GooglePmaxRemediationTaskMapping {
  taskKey: string
  taskId: string | null
  status: 'open' | 'cleared' | 'superseded'
}

export interface GooglePmaxRemediationTaskStore {
  loadContext: (launchId: string, tenantId: string, actorId: string) => Promise<GooglePmaxRemediationTaskContext | null>
  listMappings: (launchId: string) => Promise<GooglePmaxRemediationTaskMapping[]>
  createTask: (context: GooglePmaxRemediationTaskContext, draft: GooglePmaxRemediationTaskDraft, actorId: string) => Promise<string>
  reopenTask: (taskId: string, context: GooglePmaxRemediationTaskContext, actorId: string) => Promise<void>
  upsertMapping: (record: {
    context: GooglePmaxRemediationTaskContext
    draft: GooglePmaxRemediationTaskDraft
    taskId: string
  }) => Promise<void>
  clearMissing: (launchId: string, activeKeys: string[]) => Promise<number>
}

export interface GooglePmaxRemediationTaskSyncResult {
  status: 'synced' | 'project_required'
  created: number
  reopened: number
  cleared: number
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>, rowCount?: number | null }>
}

function createPostgresStore(db: Queryable): GooglePmaxRemediationTaskStore {
  return {
    async loadContext(launchId, tenantId, actorId) {
      const result = await db.query(
        `SELECT launch.id AS launch_id,
                launch.config_version,
                launch.config_hash,
                launch.brief_id,
                brief.converted_to_project_id AS project_id,
                COALESCE(brief.assigned_to, $3::uuid) AS assignee_id,
                (
                  SELECT department.id
                    FROM departments department
                   WHERE department.is_active = true
                   ORDER BY CASE department.slug
                     WHEN 'marketing' THEN 0
                     WHEN 'account-services' THEN 1
                     ELSE 2
                   END,
                   department.sort_order NULLS LAST,
                   department.created_at
                   LIMIT 1
                ) AS department_id
           FROM campaign_launches launch
           JOIN briefs brief ON brief.id = launch.brief_id
          WHERE launch.id = $1::uuid
            AND launch.tenant_id = $2::uuid
          FOR UPDATE OF launch`,
        [launchId, tenantId, actorId]
      )
      const row = result.rows[0]
      if (!row) return null
      if (!row.department_id) throw new Error('PMAX_TASK_DEPARTMENT_REQUIRED')
      const status = await db.query(
        `SELECT id
           FROM task_statuses
          WHERE (department_id IS NULL OR department_id = $1::uuid)
            AND is_default = true
          ORDER BY department_id NULLS LAST
          LIMIT 1`,
        [row.department_id]
      )
      if (!status.rows[0]?.id) throw new Error('PMAX_TASK_STATUS_REQUIRED')
      return {
        launchId: String(row.launch_id),
        configVersion: Number(row.config_version),
        configHash: String(row.config_hash),
        briefId: String(row.brief_id),
        projectId: row.project_id ? String(row.project_id) : null,
        assigneeId: String(row.assignee_id),
        departmentId: String(row.department_id),
        statusId: String(status.rows[0].id)
      }
    },

    async listMappings(launchId) {
      const result = await db.query(
        `SELECT task_key, task_id, status
           FROM campaign_launch_tasks
          WHERE launch_id = $1::uuid
          FOR UPDATE`,
        [launchId]
      )
      return result.rows.map(row => ({
        taskKey: String(row.task_key),
        taskId: row.task_id ? String(row.task_id) : null,
        status: row.status as GooglePmaxRemediationTaskMapping['status']
      }))
    },

    async createTask(context, draft, actorId) {
      if (!context.projectId) throw new Error('PMAX_PROJECT_REQUIRED')
      const dueInDays = draft.severity === 'blocker' ? 2 : 5
      const result = await db.query(
        `INSERT INTO tasks (
           project_id, department_id, status_id, title, description, priority,
           task_type, due_date, reporter_id, assignee_id, brief_id, budget_source
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
           'task', CURRENT_DATE + $7::integer, $8::uuid, $9::uuid, $10::uuid, 'brief'
         )
         RETURNING id`,
        [
          context.projectId,
          context.departmentId,
          context.statusId,
          draft.title,
          draft.description,
          draft.severity === 'blocker' ? 'urgent' : 'high',
          dueInDays,
          actorId,
          context.assigneeId,
          context.briefId
        ]
      )
      const taskId = String(result.rows[0].id)
      await db.query(
        `INSERT INTO task_activities (task_id, user_id, activity_type, content)
         VALUES ($1::uuid, $2::uuid, 'created', $3)`,
        [taskId, actorId, `Created from governed Google PMax launch blocker ${draft.sourceCode}.`]
      )
      return taskId
    },

    async reopenTask(taskId, context, actorId) {
      if (!context.projectId) throw new Error('PMAX_PROJECT_REQUIRED')
      const result = await db.query(
        `UPDATE tasks
            SET status_id = $1::uuid,
                completed_at = NULL,
                updated_at = NOW(),
                last_modified_by = $2::uuid
          WHERE id = $3::uuid
            AND project_id = $4::uuid
        RETURNING id`,
        [context.statusId, actorId, taskId, context.projectId]
      )
      if (!result.rows[0]?.id) throw new Error('PMAX_REMEDIATION_TASK_NOT_FOUND')
      await db.query(
        `INSERT INTO task_activities (task_id, user_id, activity_type, content)
         VALUES ($1::uuid, $2::uuid, 'reopened', $3)`,
        [taskId, actorId, 'Reopened because the governed Google PMax blocker recurred.']
      )
    },

    async upsertMapping({ context, draft, taskId }) {
      await db.query(
        `INSERT INTO campaign_launch_tasks (
           launch_id, config_version, config_hash, task_key, source_code,
           task_id, severity, execution, owner_type, status,
           title_snapshot, last_seen_at, cleared_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8, $9, 'open', $10, NOW(), NULL, NOW()
         )
         ON CONFLICT (launch_id, task_key) DO UPDATE SET
           task_id = COALESCE(campaign_launch_tasks.task_id, EXCLUDED.task_id),
           source_code = EXCLUDED.source_code,
           severity = EXCLUDED.severity,
           execution = EXCLUDED.execution,
           owner_type = EXCLUDED.owner_type,
           status = 'open',
           title_snapshot = EXCLUDED.title_snapshot,
           last_seen_at = NOW(),
           cleared_at = NULL,
           updated_at = NOW()`,
        [
          context.launchId,
          context.configVersion,
          context.configHash,
          draft.taskKey,
          draft.sourceCode,
          taskId,
          draft.severity,
          draft.execution,
          draft.owner,
          draft.title
        ]
      )
    },

    async clearMissing(launchId, activeKeys) {
      const result = await db.query(
        `UPDATE campaign_launch_tasks
            SET status = 'cleared', cleared_at = NOW(), updated_at = NOW()
          WHERE launch_id = $1::uuid
            AND status = 'open'
            AND NOT (task_key = ANY($2::text[]))
        RETURNING id`,
        [launchId, activeKeys]
      )
      return result.rows.length
    }
  }
}

async function syncWithStore(input: {
  launchId: string
  tenantId: string
  actorId: string
  drafts: GooglePmaxRemediationTaskDraft[]
}, store: GooglePmaxRemediationTaskStore): Promise<GooglePmaxRemediationTaskSyncResult> {
  const uniqueTaskKeys = new Set(input.drafts.map(draft => draft.taskKey))
  if (uniqueTaskKeys.size !== input.drafts.length) throw new Error('PMAX_DUPLICATE_REMEDIATION_TASK_KEY')

  const context = await store.loadContext(input.launchId, input.tenantId, input.actorId)
  if (!context) throw new Error('PMAX_LAUNCH_NOT_FOUND')
  if (!context.projectId) return { status: 'project_required', created: 0, reopened: 0, cleared: 0 }

  const existing = new Map((await store.listMappings(input.launchId)).map(mapping => [mapping.taskKey, mapping]))
  let created = 0
  let reopened = 0
  for (const draft of input.drafts) {
    const mapping = existing.get(draft.taskKey)
    let taskId = mapping?.taskId || null
    if (!taskId) {
      taskId = await store.createTask(context, draft, input.actorId)
      created++
    } else if (mapping?.status !== 'open') {
      await store.reopenTask(taskId, context, input.actorId)
      reopened++
    }
    await store.upsertMapping({ context, draft, taskId })
  }
  const activeKeys = input.drafts.map(draft => draft.taskKey)
  const cleared = await store.clearMissing(input.launchId, activeKeys)
  return { status: 'synced', created, reopened, cleared }
}

export async function syncGooglePmaxRemediationTasks(input: {
  launchId: string
  tenantId: string
  actorId: string
  drafts: GooglePmaxRemediationTaskDraft[]
}, dependencies: { store?: GooglePmaxRemediationTaskStore } = {}): Promise<GooglePmaxRemediationTaskSyncResult> {
  if (dependencies.store) return syncWithStore(input, dependencies.store)
  return transaction(async db => syncWithStore(input, createPostgresStore(db)))
}
