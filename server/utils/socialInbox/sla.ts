// server/utils/socialInbox/sla.ts
// SLA first-response tracking. Pure due-at compute + DB-injected stamp/scan. v1 = elapsed minutes
// (business-hours-aware SLA is a documented fast-follow).
export interface SlaDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

const DEFAULT_TARGET = 240

export function computeSlaDueAt(policy: { target_minutes?: number }, now: Date): string {
  const mins = Number(policy?.target_minutes) > 0 ? Number(policy.target_minutes) : DEFAULT_TARGET
  return new Date(now.getTime() + mins * 60_000).toISOString()
}

/** On a new inbound, stamp sla_due_at if a policy applies and none is set yet. Returns the due ISO or null. */
export async function applySlaOnInbound(db: SlaDb, conversationId: string, clientId: string, channelType: string, now: Date): Promise<string | null> {
  const policy = await db.queryOne<{ target_minutes: number }>(
    `SELECT target_minutes FROM social_sla_policies
       WHERE client_id = $1 AND enabled = TRUE AND (channel_type = $2 OR channel_type IS NULL)
       ORDER BY channel_type NULLS LAST LIMIT 1`, [clientId, channelType])
  if (!policy) return null

  const current = await db.queryOne<{ sla_due_at: string | null }>(
    `SELECT sla_due_at FROM social_conversations WHERE id = $1`, [conversationId])
  if (current?.sla_due_at) return null

  const dueAt = computeSlaDueAt(policy, now)
  await db.execute(`UPDATE social_conversations SET sla_due_at = $1, updated_at = NOW() WHERE id = $2`, [dueAt, conversationId])
  return dueAt
}

/**
 * Find conversations that breached SLA (past due, no first response, not yet flagged), mark them
 * sla_breached, and return them so the caller can fire breach notifications.
 */
export async function findBreaches(db: SlaDb): Promise<Array<{ id: string; client_id: string; assigned_to: string | null }>> {
  const rows = await db.queryRows<{ id: string; client_id: string; assigned_to: string | null }>(
    `SELECT id, client_id, assigned_to FROM social_conversations
       WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW()
         AND first_response_at IS NULL AND sla_breached = FALSE AND status <> 'closed'
       LIMIT 200`)
  if (rows.length) {
    await db.execute(`UPDATE social_conversations SET sla_breached = TRUE, updated_at = NOW() WHERE id = ANY($1)`,
      [rows.map(r => r.id)])
  }
  return rows
}
