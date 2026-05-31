/** List tracking sites (optionally ?clientId=). GET /api/agency/tracking
 *  Scoped: management roles see all; media_buyer/account_manager only their
 *  assigned clients' sites (client_team_assignments). */
import { query } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { ANALYTICS_ROLES, requireClientTrackingAccess, accessibleClientIds } from '~~/server/utils/tracking/analytics-access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  const { clientId } = getQuery(event) as { clientId?: string }

  let where = ''
  let params: any[] = []
  if (clientId) {
    await requireClientTrackingAccess(event, clientId) // 403 if not allowed
    where = 'WHERE s.client_id = $1'
    params = [clientId]
  } else {
    const ids = await accessibleClientIds(user)
    if (ids !== null) {
      if (ids.length === 0) return { sites: [] }
      where = 'WHERE s.client_id = ANY($1::uuid[])'
      params = [ids]
    }
  }

  const rows = await query(
    `SELECT s.*, c.name AS client_name, (
        SELECT COUNT(*) FROM tracking_events e
         WHERE e.site_id = s.id AND e.received_at > NOW() - INTERVAL '24 hours'
      ) AS events_24h
       FROM tracking_sites s
       LEFT JOIN agency_clients c ON c.id = s.client_id
      ${where}
      ORDER BY c.name ASC, s.created_at DESC`,
    params
  )
  return { sites: rows }
})
