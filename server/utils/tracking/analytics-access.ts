/**
 * Per-client access gate for tracking analytics endpoints (closes the Slice-1
 * IDOR: provisioning endpoints were role-gated only).
 *
 * Management roles see every client. Scoped roles (media_buyer, account_manager)
 * may only read clients they're assigned to via client_team_assignments
 * (team_member_id === the authenticated user's id — the user table IS
 * team_members). NEVER trust a clientId without calling this first.
 */
import type { H3Event } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const MANAGEMENT_ROLES = ['owner', 'admin', 'lead', 'project_manager'] as const
const SCOPED_ROLES = ['media_buyer', 'account_manager'] as const
export const ANALYTICS_ROLES = [...MANAGEMENT_ROLES, ...SCOPED_ROLES]

export function isManagementRole(role: string): boolean {
  return (MANAGEMENT_ROLES as readonly string[]).includes(role)
}

/** Authenticates, role-gates, and (for scoped roles) verifies client assignment.
 *  Throws 401/403/400 as appropriate. Returns the authenticated user. */
export async function requireClientTrackingAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  if (isManagementRole(user.role)) return user
  const row = await queryOne(
    `SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 LIMIT 1`,
    [clientId, user.id]
  )
  if (!row) throw createError({ statusCode: 403, statusMessage: 'No access to this client' })
  return user
}
