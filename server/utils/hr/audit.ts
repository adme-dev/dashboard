import { queryOne } from '~~/server/utils/db'

type HrAuditDatabase = {
  query: (sql: string, params?: any[]) => Promise<any>
}

type HrAuditInput = {
  actorId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  cycleId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export async function recordHrAuditEvent(input: HrAuditInput, db?: HrAuditDatabase): Promise<void> {
  const sql = `INSERT INTO hr_audit_events
      (actor_id, action, target_type, target_id, cycle_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`
  const params = [
    input.actorId ?? null,
    input.action,
    input.targetType,
    input.targetId ?? null,
    input.cycleId ?? null,
    JSON.stringify(input.metadata ?? {}),
  ]
  if (db) {
    await db.query(sql, params)
    return
  }
  await queryOne(sql, params)
}
