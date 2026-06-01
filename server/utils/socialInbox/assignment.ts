// server/utils/socialInbox/assignment.ts
// Round-robin conversation assignment to a client's team members. Pure picker + DB-injected applier.
export interface AssignDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

/** Next member after `lastAssignee` (round-robin). null/unknown last → first member. [] → null. */
export function pickRoundRobin(members: string[], lastAssignee: string | null): string | null {
  if (!members.length) return null
  if (!lastAssignee) return members[0]!
  const idx = members.indexOf(lastAssignee)
  if (idx === -1) return members[0]!
  return members[(idx + 1) % members.length]!
}

/**
 * Auto-assign an unassigned conversation to the next team member of its client. No-op if the
 * conversation is already assigned or the client has no team. Returns the assignee id, or null.
 */
export async function autoAssignConversation(db: AssignDb, conversationId: string, clientId: string): Promise<string | null> {
  const conv = await db.queryOne<{ assigned_to: string | null }>(
    `SELECT assigned_to FROM social_conversations WHERE id = $1`, [conversationId])
  if (!conv || conv.assigned_to) return null

  const members = (await db.queryRows<{ team_member_id: string }>(
    `SELECT team_member_id FROM client_team_assignments WHERE client_id = $1 ORDER BY team_member_id ASC`, [clientId]))
    .map(m => m.team_member_id)
  if (!members.length) return null

  const last = await db.queryOne<{ assigned_to: string }>(
    `SELECT assigned_to FROM social_conversations
       WHERE client_id = $1 AND assigned_to IS NOT NULL
       ORDER BY assigned_at DESC, id DESC LIMIT 1`, [clientId])

  const next = pickRoundRobin(members, last?.assigned_to ?? null)
  if (!next) return null
  await db.execute(
    `UPDATE social_conversations SET assigned_to = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [next, conversationId])
  return next
}
