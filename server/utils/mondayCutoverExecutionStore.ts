import { createHash } from 'node:crypto'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import {
  buildMondayCutoverTaskDrafts,
  type MondayCutoverExecutionSourceRecord
} from '~~/server/utils/mondayCutoverExecution'
import type { MondayCutoverPlan } from '~~/server/utils/mondayCutoverPlan'

const TimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)

const RunRowSchema = z.strictObject({
  id: z.string().uuid(),
  artifact_id: z.string().uuid(),
  source_board_id: z.string().regex(/^\d+$/).max(30),
  target_board_id: z.string().uuid(),
  artifact_revision: z.number().int().positive(),
  plan_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  idempotency_key: z.string().uuid(),
  status: z.enum(['prepared', 'executing', 'completed', 'failed', 'rollback_pending', 'rolled_back']),
  execute_reason: z.string().min(10).max(1000),
  executed_by: z.string().uuid(),
  created_tasks: z.number().int().nonnegative(),
  reused_tasks: z.number().int().nonnegative(),
  excluded_records: z.number().int().nonnegative(),
  error_code: z.string().min(1).max(100).nullable(),
  rollback_reason: z.string().min(10).max(1000).nullable(),
  rollback_by: z.string().uuid().nullable(),
  prepared_at: TimestampSchema,
  started_at: TimestampSchema.nullable(),
  completed_at: TimestampSchema.nullable(),
  failed_at: TimestampSchema.nullable(),
  rollback_started_at: TimestampSchema.nullable(),
  rolled_back_at: TimestampSchema.nullable()
})

export type MondayCutoverExecutionRun = {
  id: string
  artifactId: string
  sourceBoardId: string
  targetBoardId: string
  artifactRevision: number
  planFingerprint: string
  idempotencyKey: string
  status: 'prepared' | 'executing' | 'completed' | 'failed' | 'rollback_pending' | 'rolled_back'
  executeReason: string
  executedBy: string
  createdTasks: number
  reusedTasks: number
  excludedRecords: number
  errorCode: string | null
  rollbackReason: string | null
  rollbackBy: string | null
  preparedAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  rollbackStartedAt: string | null
  rolledBackAt: string | null
}

export class MondayCutoverExecutionConflictError extends Error {
  constructor(message = 'Monday cutover execution conflict') {
    super(message)
    this.name = 'MondayCutoverExecutionConflictError'
  }
}

function toRun(value: unknown): MondayCutoverExecutionRun {
  const row = RunRowSchema.parse(value)
  return {
    id: row.id,
    artifactId: row.artifact_id,
    sourceBoardId: row.source_board_id,
    targetBoardId: row.target_board_id,
    artifactRevision: row.artifact_revision,
    planFingerprint: row.plan_fingerprint,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    executeReason: row.execute_reason,
    executedBy: row.executed_by,
    createdTasks: row.created_tasks,
    reusedTasks: row.reused_tasks,
    excludedRecords: row.excluded_records,
    errorCode: row.error_code,
    rollbackReason: row.rollback_reason,
    rollbackBy: row.rollback_by,
    preparedAt: row.prepared_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    rollbackStartedAt: row.rollback_started_at,
    rolledBackAt: row.rolled_back_at
  }
}

function hashReason(reason: string): string {
  return createHash('sha256').update(reason).digest('hex')
}

const RUN_COLUMNS = `id,
                     artifact_id,
                     source_board_id,
                     target_board_id,
                     artifact_revision,
                     plan_fingerprint,
                     idempotency_key,
                     status,
                     execute_reason,
                     executed_by,
                     created_tasks,
                     reused_tasks,
                     excluded_records,
                     error_code,
                     rollback_reason,
                     rollback_by,
                     prepared_at,
                     started_at,
                     completed_at,
                     failed_at,
                     rollback_started_at,
                     rolled_back_at`

export async function prepareMondayCutoverExecutionRun(input: {
  artifactId: string
  sourceBoardId: string
  targetBoardId: string
  artifactRevision: number
  planFingerprint: string
  idempotencyKey: string
  actorId: string
  reason: string
}): Promise<{ run: MondayCutoverExecutionRun, isReplay: boolean }> {
  try {
    return await transaction(async (db) => {
      const inserted = await db.query(
        `INSERT INTO monday_cutover_execution_runs (
           artifact_id,
           source_board_id,
           target_board_id,
           artifact_revision,
           plan_fingerprint,
           idempotency_key,
           execute_reason,
           executed_by
         ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::uuid, $7, $8::uuid)
         ON CONFLICT (source_board_id, target_board_id, idempotency_key) DO NOTHING
         RETURNING ${RUN_COLUMNS}`,
        [
          input.artifactId,
          input.sourceBoardId,
          input.targetBoardId,
          input.artifactRevision,
          input.planFingerprint,
          input.idempotencyKey,
          input.reason,
          input.actorId
        ]
      )

      if (inserted.rows[0]) {
        const run = toRun(inserted.rows[0])
        await db.query(
          `INSERT INTO monday_cutover_execution_audit (
             run_id, action, actor_id, reason_hash, plan_fingerprint, counts
           ) VALUES ($1::uuid, 'prepared', $2::uuid, $3, $4, '{}'::jsonb)`,
          [run.id, input.actorId, hashReason(input.reason), input.planFingerprint]
        )
        return { run, isReplay: false }
      }

      const existing = await db.query(
        `SELECT ${RUN_COLUMNS}
           FROM monday_cutover_execution_runs
          WHERE source_board_id = $1
            AND target_board_id = $2::uuid
            AND idempotency_key = $3::uuid
          FOR UPDATE`,
        [input.sourceBoardId, input.targetBoardId, input.idempotencyKey]
      )
      if (!existing.rows[0]) throw new MondayCutoverExecutionConflictError()
      const run = toRun(existing.rows[0])
      if (
        run.artifactId !== input.artifactId
        || run.artifactRevision !== input.artifactRevision
        || run.planFingerprint !== input.planFingerprint
        || run.executedBy !== input.actorId
      ) {
        throw new MondayCutoverExecutionConflictError('Idempotency key belongs to different cutover evidence')
      }
      return { run, isReplay: true }
    })
  } catch (error: unknown) {
    if (error instanceof MondayCutoverExecutionConflictError) throw error
    if ((error as { code?: string })?.code === '23505') {
      throw new MondayCutoverExecutionConflictError('Another active execution exists for this approval')
    }
    throw error
  }
}

export async function executeMondayCutoverRun(input: {
  runId: string
  artifactId: string
  sourceBoardId: string
  targetBoardId: string
  artifactRevision: number
  planFingerprint: string
  actorId: string
  reason: string
  plan: MondayCutoverPlan
  sourceRecords: MondayCutoverExecutionSourceRecord[]
}): Promise<MondayCutoverExecutionRun> {
  const drafts = buildMondayCutoverTaskDrafts({
    plan: input.plan,
    sourceRecords: input.sourceRecords
  })
  const sourceById = new Map(input.sourceRecords.map(source => [source.id, source]))

  return transaction(async (db) => {
    const started = await db.query(
      `UPDATE monday_cutover_execution_runs
          SET status = 'executing',
              started_at = NOW()
        WHERE id = $1::uuid
          AND artifact_id = $2::uuid
          AND status = 'prepared'
      RETURNING ${RUN_COLUMNS}`,
      [input.runId, input.artifactId]
    )
    if (!started.rows[0]) throw new MondayCutoverExecutionConflictError('Execution run is not prepared')

    const approval = await db.query(
      `SELECT id
         FROM monday_cutover_approval_artifacts
        WHERE id = $1::uuid
          AND source_board_id = $2
          AND target_board_id = $3::uuid
          AND revision = $4
          AND state = 'approved'
          AND plan_fingerprint = $5
        FOR UPDATE`,
      [
        input.artifactId,
        input.sourceBoardId,
        input.targetBoardId,
        input.artifactRevision,
        input.planFingerprint
      ]
    )
    if (!approval.rows[0]) throw new MondayCutoverExecutionConflictError('Approved cutover evidence changed')

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [input.sourceBoardId, input.targetBoardId]
    )

    const statusResult = await db.query(
      `SELECT id
         FROM task_statuses
        WHERE department_id = $1::uuid
          AND is_default = TRUE
        ORDER BY sort_order
        LIMIT 1`,
      [input.targetBoardId]
    )
    const targetGroupResult = await db.query(
      `SELECT id
         FROM board_groups
        WHERE id = $1::uuid
          AND department_id = $2::uuid`,
      [input.plan.placement.targetGroupId, input.targetBoardId]
    )
    const clientColumnResult = await db.query(
      `SELECT id
         FROM custom_columns
        WHERE department_id = $1::uuid
          AND column_type = 'client'
        ORDER BY sort_order
        LIMIT 1`,
      [input.targetBoardId]
    )
    const statusId = statusResult.rows[0]?.id
    const targetGroupId = targetGroupResult.rows[0]?.id
    const clientColumnId = clientColumnResult.rows[0]?.id
    if (!statusId || !targetGroupId) {
      throw new MondayCutoverExecutionConflictError('Target board execution configuration changed')
    }
    if (drafts.some(draft => draft.clientId) && !clientColumnId) {
      throw new MondayCutoverExecutionConflictError('Target board client column is unavailable')
    }

    const createdTaskBySource = new Map<string, string>()
    for (const draft of drafts) {
      const parentTaskId = draft.parentSourceId
        ? createdTaskBySource.get(draft.parentSourceId) ?? draft.parentTargetTaskId
        : null
      if (draft.parentSourceId && !parentTaskId) {
        throw new MondayCutoverExecutionConflictError(`Parent task was not created for source ${draft.sourceId}`)
      }

      const taskResult = await db.query(
        `INSERT INTO tasks (
           department_id,
           status_id,
           parent_task_id,
           title,
           description,
           priority,
           reporter_id,
           due_date,
           sort_order,
           group_id,
           monday_item_id,
           monday_board_id,
           created_at,
           updated_at
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'medium', $6::uuid, $7::date, $8, $9::uuid, $10, $11, NOW(), NOW())
         RETURNING id, version`,
        [
          input.targetBoardId,
          statusId,
          parentTaskId,
          draft.title,
          draft.description,
          input.actorId,
          draft.dueDate,
          draft.sortOrder,
          targetGroupId,
          draft.sourceId,
          input.sourceBoardId
        ]
      )
      const taskId = String(taskResult.rows[0]?.id ?? '')
      const taskVersion = Number(taskResult.rows[0]?.version ?? 0)
      if (!taskId || taskVersion < 1) throw new Error('Task insert did not return execution evidence')
      createdTaskBySource.set(draft.sourceId, taskId)

      const safeSourceData = JSON.stringify({
        sourceBoardId: input.sourceBoardId,
        sourceItemId: draft.sourceId,
        sourceUpdatedAt: draft.sourceUpdatedAt,
        importedBy: 'governed_cutover'
      })
      const safeColumnEvidence = JSON.stringify({
        clientId: draft.clientId,
        dueDateImported: Boolean(draft.dueDate),
        descriptionImported: Boolean(draft.description)
      })
      const mappingResult = await db.query(
        `INSERT INTO monday_item_mappings (
           monday_item_id,
           monday_item_name,
           monday_parent_item_id,
           task_id,
           source_data,
           column_values,
           status,
           monday_board_id,
           monday_group_id,
           monday_group_title,
           source_state,
           reconciliation_status,
           source_updated_at,
           last_seen_at
         ) VALUES ($1, $2, $3, $4::uuid, $5::jsonb, $6::jsonb, 'completed', $7, $8, $9, 'active', 'current', $10::timestamptz, NOW())
         RETURNING id`,
        [
          draft.sourceId,
          draft.title,
          draft.parentSourceId,
          taskId,
          safeSourceData,
          safeColumnEvidence,
          input.sourceBoardId,
          draft.sourceGroupId,
          draft.sourceGroupTitle,
          draft.sourceUpdatedAt
        ]
      )
      const mappingId = String(mappingResult.rows[0]?.id ?? '')
      if (!mappingId) throw new Error('Provenance mapping insert did not return evidence')

      let clientColumnValueId: string | null = null
      if (draft.clientId && draft.clientName) {
        const clientValueResult = await db.query(
          `INSERT INTO task_column_values (
             task_id, column_id, text_value, json_value
           ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb)
           ON CONFLICT (task_id, column_id) DO UPDATE SET
             text_value = EXCLUDED.text_value,
             json_value = EXCLUDED.json_value,
             updated_at = NOW()
           RETURNING id`,
          [
            taskId,
            clientColumnId,
            draft.clientName,
            JSON.stringify({ clientId: draft.clientId, clientName: draft.clientName })
          ]
        )
        clientColumnValueId = String(clientValueResult.rows[0]?.id ?? '')
        if (!clientColumnValueId) {
          throw new Error('Client column insert did not return execution evidence')
        }
      }

      await db.query(
        `INSERT INTO monday_cutover_execution_items (
           run_id,
           source_item_id,
           source_parent_item_id,
           action,
           task_id,
           mapping_id,
           client_id,
           client_column_value_id,
           client_column_id,
           source_updated_at,
           created_task_version,
           sort_order
         ) VALUES ($1::uuid, $2, $3, 'created', $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::timestamptz, $10, $11)`,
        [
          input.runId,
          draft.sourceId,
          draft.parentSourceId,
          taskId,
          mappingId,
          draft.clientId,
          clientColumnValueId,
          draft.clientId ? clientColumnId : null,
          draft.sourceUpdatedAt,
          taskVersion,
          draft.sortOrder
        ]
      )
    }

    const nonCreateRecords = input.plan.records.filter(record => (
      record.action === 'reuse' || record.action === 'exclude'
    ))
    for (const [offset, record] of nonCreateRecords.entries()) {
      const source = sourceById.get(record.sourceId)
      if (!source || source.updatedAt !== record.sourceUpdatedAt) {
        throw new MondayCutoverExecutionConflictError(`Stale source evidence for ${record.sourceId}`)
      }
      await db.query(
        `INSERT INTO monday_cutover_execution_items (
           run_id,
           source_item_id,
           source_parent_item_id,
           action,
           task_id,
           client_id,
           source_updated_at,
           sort_order
         ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::timestamptz, $8)`,
        [
          input.runId,
          record.sourceId,
          record.parentSourceId,
          record.action === 'reuse' ? 'reused' : 'excluded',
          record.match.targetTaskId,
          record.clientLink.clientId,
          record.sourceUpdatedAt,
          drafts.length + offset
        ]
      )
    }

    const reusedTasks = nonCreateRecords.filter(record => record.action === 'reuse').length
    const excludedRecords = nonCreateRecords.length - reusedTasks
    const completed = await db.query(
      `UPDATE monday_cutover_execution_runs
          SET status = 'completed',
              created_tasks = $2,
              reused_tasks = $3,
              excluded_records = $4,
              completed_at = NOW()
        WHERE id = $1::uuid
          AND status = 'executing'
      RETURNING ${RUN_COLUMNS}`,
      [input.runId, drafts.length, reusedTasks, excludedRecords]
    )
    if (!completed.rows[0]) throw new MondayCutoverExecutionConflictError('Execution completion conflict')

    await db.query(
      `INSERT INTO monday_cutover_execution_audit (
         run_id, action, actor_id, reason_hash, plan_fingerprint, counts
       ) VALUES ($1::uuid, 'executed', $2::uuid, $3, $4, $5::jsonb)`,
      [
        input.runId,
        input.actorId,
        hashReason(input.reason),
        input.planFingerprint,
        JSON.stringify({ createdTasks: drafts.length, reusedTasks, excludedRecords })
      ]
    )

    return toRun(completed.rows[0])
  })
}

export async function failMondayCutoverExecutionRun(input: {
  runId: string
  actorId: string
  reason: string
  planFingerprint: string
  errorCode: 'VALIDATION_FAILED' | 'EVIDENCE_CONFLICT' | 'EXECUTION_FAILED'
}): Promise<MondayCutoverExecutionRun | null> {
  return transaction(async (db) => {
    const failed = await db.query(
      `UPDATE monday_cutover_execution_runs
          SET status = 'failed',
              error_code = $2,
              failed_at = NOW()
        WHERE id = $1::uuid
          AND status IN ('prepared', 'executing')
      RETURNING ${RUN_COLUMNS}`,
      [input.runId, input.errorCode]
    )
    if (!failed.rows[0]) return null

    await db.query(
      `INSERT INTO monday_cutover_execution_audit (
         run_id, action, actor_id, reason_hash, plan_fingerprint, counts
       ) VALUES ($1::uuid, 'failed', $2::uuid, $3, $4, '{}'::jsonb)`,
      [input.runId, input.actorId, hashReason(input.reason), input.planFingerprint]
    )
    return toRun(failed.rows[0])
  })
}

export async function rollbackMondayCutoverRun(input: {
  runId: string
  sourceBoardId: string
  targetBoardId: string
  expectedPlanFingerprint: string
  actorId: string
  reason: string
}): Promise<MondayCutoverExecutionRun> {
  return transaction(async (db) => {
    const locked = await db.query(
      `SELECT ${RUN_COLUMNS}
         FROM monday_cutover_execution_runs
        WHERE id = $1::uuid
          AND source_board_id = $2
          AND target_board_id = $3::uuid
          AND plan_fingerprint = $4
          AND status = 'completed'
        FOR UPDATE`,
      [input.runId, input.sourceBoardId, input.targetBoardId, input.expectedPlanFingerprint]
    )
    if (!locked.rows[0]) {
      throw new MondayCutoverExecutionConflictError('Completed execution run not found for rollback')
    }
    const completedRun = toRun(locked.rows[0])

    const pending = await db.query(
      `UPDATE monday_cutover_execution_runs
          SET status = 'rollback_pending',
              rollback_reason = $2,
              rollback_by = $3::uuid,
              rollback_started_at = NOW()
        WHERE id = $1::uuid
          AND status = 'completed'
      RETURNING ${RUN_COLUMNS}`,
      [input.runId, input.reason, input.actorId]
    )
    if (!pending.rows[0]) throw new MondayCutoverExecutionConflictError('Rollback state conflict')

    await db.query(
      `INSERT INTO monday_cutover_execution_audit (
         run_id, action, actor_id, reason_hash, plan_fingerprint, counts
       ) VALUES ($1::uuid, 'rollback_started', $2::uuid, $3, $4, $5::jsonb)`,
      [
        input.runId,
        input.actorId,
        hashReason(input.reason),
        input.expectedPlanFingerprint,
        JSON.stringify({ createdTasks: completedRun.createdTasks })
      ]
    )

    const itemResult = await db.query(
      `SELECT source_item_id,
              task_id,
              mapping_id,
              client_id,
              client_column_value_id,
              client_column_id,
              created_task_version,
              sort_order
         FROM monday_cutover_execution_items
        WHERE run_id = $1::uuid
          AND action = 'created'
        ORDER BY sort_order DESC`,
      [input.runId]
    )
    if (itemResult.rows.length !== completedRun.createdTasks) {
      throw new MondayCutoverExecutionConflictError('Rollback item evidence is incomplete')
    }

    const createdItems = itemResult.rows.map((row: Record<string, unknown>) => ({
      sourceItemId: String(row.source_item_id ?? ''),
      taskId: String(row.task_id ?? ''),
      mappingId: String(row.mapping_id ?? ''),
      clientId: row.client_id ? String(row.client_id) : null,
      clientColumnValueId: row.client_column_value_id
        ? String(row.client_column_value_id)
        : null,
      clientColumnId: row.client_column_id ? String(row.client_column_id) : null,
      createdTaskVersion: Number(row.created_task_version ?? 0)
    }))
    if (createdItems.some(item => (
      !/^\d{1,30}$/.test(item.sourceItemId)
      || !item.taskId
      || !item.mappingId
      || item.createdTaskVersion < 1
      || Boolean(item.clientId) !== Boolean(item.clientColumnValueId)
      || Boolean(item.clientId) !== Boolean(item.clientColumnId)
    ))) {
      throw new MondayCutoverExecutionConflictError('Rollback item evidence is invalid')
    }

    const taskIds = createdItems.map(item => item.taskId)
    const taskResult = await db.query(
      `SELECT id, version
         FROM tasks
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [taskIds]
    )
    const versionByTask = new Map(taskResult.rows.map((row: Record<string, unknown>) => (
      [String(row.id), Number(row.version)]
    )))
    if (
      versionByTask.size !== createdItems.length
      || createdItems.some(item => versionByTask.get(item.taskId) !== item.createdTaskVersion)
    ) {
      throw new MondayCutoverExecutionConflictError('Created task was modified after cutover')
    }

    const unexpectedChildren = await db.query(
      `SELECT COUNT(*)::text AS count
         FROM tasks
        WHERE parent_task_id = ANY($1::uuid[])
          AND NOT (id = ANY($1::uuid[]))`,
      [taskIds]
    )
    if (Number(unexpectedChildren.rows[0]?.count ?? 0) > 0) {
      throw new MondayCutoverExecutionConflictError('Created task has new descendants after cutover')
    }

    const mappingIds = createdItems.map(item => item.mappingId)
    const clientColumnValueIds = createdItems.flatMap(item => (
      item.clientColumnValueId ? [item.clientColumnValueId] : []
    ))
    const dependencyResult = await db.query(
      `SELECT monday_cutover_tasks_have_external_dependencies(
                $1::uuid[],
                $2::uuid[],
                $3::uuid[]
              ) AS has_dependencies`,
      [taskIds, mappingIds, clientColumnValueIds]
    )
    if (dependencyResult.rows[0]?.has_dependencies !== false) {
      throw new MondayCutoverExecutionConflictError('Created task has related content after cutover')
    }

    for (const item of createdItems) {
      if (item.clientId && item.clientColumnValueId && item.clientColumnId) {
        const clientValueDelete = await db.query(
          `DELETE FROM task_column_values
            WHERE id = $1::uuid
              AND task_id = $2::uuid
              AND column_id = $3::uuid
              AND json_value ->> 'clientId' = $4
              AND text_value = json_value ->> 'clientName'`,
          [item.clientColumnValueId, item.taskId, item.clientColumnId, item.clientId]
        )
        if (clientValueDelete.rowCount !== 1) {
          throw new MondayCutoverExecutionConflictError('Client column value changed after cutover')
        }
      }

      const mappingDelete = await db.query(
        `DELETE FROM monday_item_mappings
          WHERE id = $1::uuid
            AND task_id = $2::uuid
            AND monday_board_id = $3
            AND monday_item_id = $4`,
        [item.mappingId, item.taskId, input.sourceBoardId, item.sourceItemId]
      )
      if (mappingDelete.rowCount !== 1) {
        throw new MondayCutoverExecutionConflictError('Provenance mapping changed after cutover')
      }

      const taskDelete = await db.query(
        `DELETE FROM tasks
          WHERE id = $1::uuid
            AND version = $2`,
        [item.taskId, item.createdTaskVersion]
      )
      if (taskDelete.rowCount !== 1) {
        throw new MondayCutoverExecutionConflictError('Created task changed during rollback')
      }
    }

    const rolledBack = await db.query(
      `UPDATE monday_cutover_execution_runs
          SET status = 'rolled_back',
              rolled_back_at = NOW()
        WHERE id = $1::uuid
          AND status = 'rollback_pending'
      RETURNING ${RUN_COLUMNS}`,
      [input.runId]
    )
    if (!rolledBack.rows[0]) throw new MondayCutoverExecutionConflictError('Rollback completion conflict')

    await db.query(
      `INSERT INTO monday_cutover_execution_audit (
         run_id, action, actor_id, reason_hash, plan_fingerprint, counts
       ) VALUES ($1::uuid, 'rolled_back', $2::uuid, $3, $4, $5::jsonb)`,
      [
        input.runId,
        input.actorId,
        hashReason(input.reason),
        input.expectedPlanFingerprint,
        JSON.stringify({ deletedTasks: createdItems.length })
      ]
    )
    return toRun(rolledBack.rows[0])
  })
}
