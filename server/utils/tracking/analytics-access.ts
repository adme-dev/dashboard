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
import { queryOne, query } from '~~/server/utils/db'

const MANAGEMENT_ROLES = ['owner', 'admin', 'lead', 'project_manager'] as const
const SCOPED_ROLES = ['media_buyer', 'account_manager'] as const
export const ANALYTICS_ROLES = [...MANAGEMENT_ROLES, ...SCOPED_ROLES]

export function isManagementRole(role: string): boolean {
  return (MANAGEMENT_ROLES as readonly string[]).includes(role)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** True for a canonical UUID. Used to 400 malformed ids before they reach a
 *  uuid column (an invalid cast otherwise surfaces as a Postgres 500). */
export function isUuid(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v)
}

/** Authenticates, role-gates, and (for scoped roles) verifies client assignment.
 *  Throws 401/403/400 as appropriate. Returns the authenticated user. */
export async function requireClientTrackingAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  if (!isUuid(clientId)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  if (isManagementRole(user.role)) return user
  const row = await queryOne(
    `SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 LIMIT 1`,
    [clientId, user.id]
  )
  if (!row) throw createError({ statusCode: 403, statusMessage: 'No access to this client' })
  return user
}

/** Client ids the user may access: null = all clients (management role); else the
 *  array of clients assigned via client_team_assignments. Use to scope list queries. */
export async function accessibleClientIds(user: { id: string, role: string }): Promise<string[] | null> {
  if (isManagementRole(user.role)) return null
  const rows = await query<{ client_id: string }>(
    `SELECT client_id FROM client_team_assignments WHERE team_member_id = $1`,
    [user.id]
  )
  return rows.map(r => r.client_id)
}

/** Resolve a tracking site's owning client and gate access on it (for endpoints
 *  keyed by site id, not client id). Returns the site's client_id. 404 if unknown. */
export async function requireSiteTrackingAccess(event: H3Event, siteId: string | undefined): Promise<string> {
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'site id is required' })
  if (!isUuid(siteId)) throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  const row = await queryOne<{ client_id: string }>(
    `SELECT client_id FROM tracking_sites WHERE id = $1`,
    [siteId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  await requireClientTrackingAccess(event, row.client_id)
  return row.client_id
}
