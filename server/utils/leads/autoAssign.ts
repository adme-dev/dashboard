// server/utils/leads/autoAssign.ts
import { queryOne } from '~~/server/utils/db'

/**
 * Resolve the team_member_id of the primary AM for a client, if any.
 * Falls back to null when no assignment exists or client_id is null.
 */
export async function resolveAssignedAm(clientId: string | null): Promise<string | null> {
  if (!clientId) return null
  const row = await queryOne<{ team_member_id: string }>(`
    SELECT team_member_id FROM client_team_assignments
    WHERE client_id = $1 AND role = 'primary_am'
    ORDER BY assigned_at DESC
    LIMIT 1
  `, [clientId])
  return row?.team_member_id ?? null
}
