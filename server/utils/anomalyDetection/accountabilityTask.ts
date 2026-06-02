import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'

export interface AnomalyForTask {
  id: string
  title: string
  description: string
  fingerprint: string
}

export interface TaskPayload {
  title: string
  description: string
  priority: 'high'
  dueDate: string // YYYY-MM-DD
}

export function buildTaskPayload(anomaly: AnomalyForTask, now: Date): TaskPayload {
  const due = new Date(now.getTime() + 24 * 3_600_000)
  return {
    title: `Budget issue: ${anomaly.title}`.slice(0, 255),
    description: [
      anomaly.description,
      '',
      `Source: automated budget anomaly`,
      `Fingerprint: ${anomaly.fingerprint}`,
      `Anomaly ID: ${anomaly.id}`,
    ].join('\n'),
    priority: 'high',
    dueDate: due.toISOString().slice(0, 10),
  }
}

interface AnomalyRowForTask extends AnomalyForTask { context: Record<string, any> | null }

/**
 * Create one accountability task per newly-inserted critical adspend/budget
 * anomaly, when create_tasks is enabled and an assignee is configured.
 * Idempotent: skips anomalies that already have context.task_id.
 */
export async function maybeCreateAccountabilityTasks(tenantId: string, anomalyIds: string[]): Promise<void> {
  if (anomalyIds.length === 0) return
  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.create_tasks) return
  if (!cfg.task_assignee_id) {
    console.warn('[budget-tasks] create_tasks on but no task_assignee_id — skipping')
    return
  }

  // Department: the assignee's department, else the first active department.
  const dept = await queryOne<{ id: string }>(
    `SELECT COALESCE(
        (SELECT department_id FROM team_members WHERE id = $1),
        (SELECT id FROM departments WHERE is_active = true ORDER BY created_at ASC LIMIT 1)
      ) AS id`,
    [cfg.task_assignee_id],
  )
  if (!dept?.id) { console.warn('[budget-tasks] no department to attach tasks to — skipping'); return }

  // Status: the default status for that department (or a global default); fall
  // back to the lowest-sort_order status if none is flagged default.
  let status = await queryOne<{ id: string }>(
    `SELECT id FROM task_statuses
     WHERE (department_id IS NULL OR department_id = $1) AND is_default = true
     ORDER BY department_id NULLS LAST
     LIMIT 1`,
    [dept.id],
  )
  if (!status?.id) {
    status = await queryOne<{ id: string }>(
      `SELECT id FROM task_statuses
       WHERE (department_id IS NULL OR department_id = $1)
       ORDER BY department_id NULLS LAST, sort_order ASC, created_at ASC
       LIMIT 1`,
      [dept.id],
    )
  }
  if (!status?.id) { console.warn('[budget-tasks] no status to attach tasks to — skipping'); return }

  const rows = await queryRows<AnomalyRowForTask>(
    `SELECT id, title, description, fingerprint, context
     FROM anomalies
     WHERE tenant_id = $1 AND id = ANY($2) AND type IN ('adspend','budget')`,
    [tenantId, anomalyIds],
  )
  const now = new Date()
  for (const row of rows) {
    if (row.context && (row.context as any).task_id) continue
    const payload = buildTaskPayload(row, now)
    await transaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO tasks (department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date)
         VALUES ($1, $2, $3, $4, $5, 'task', $6, $6, $7)
         RETURNING id`,
        [dept.id, status!.id, payload.title, payload.description, payload.priority, cfg.task_assignee_id, payload.dueDate],
      )
      const taskId = (ins as any).rows[0].id
      await client.query(
        `INSERT INTO task_activities (task_id, user_id, activity_type, content)
         VALUES ($1, $2, 'created', $3)`,
        [taskId, cfg.task_assignee_id, `Auto-created from budget anomaly ${row.fingerprint}`],
      )
      await client.query(
        `UPDATE anomalies SET context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('task_id', $1::text) WHERE id = $2`,
        [taskId, row.id],
      )
    })
  }
}
