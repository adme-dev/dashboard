/** List tracking sites (optionally ?clientId=). GET /api/agency/tracking */
import { query } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const { clientId } = getQuery(event) as { clientId?: string }
  const rows = await query(
    `SELECT s.*, c.name AS client_name, (
        SELECT COUNT(*) FROM tracking_events e
         WHERE e.site_id = s.id AND e.received_at > NOW() - INTERVAL '24 hours'
      ) AS events_24h
       FROM tracking_sites s
       LEFT JOIN agency_clients c ON c.id = s.client_id
      ${clientId ? 'WHERE s.client_id = $1' : ''}
      ORDER BY c.name ASC, s.created_at DESC`,
    clientId ? [clientId] : []
  )
  return { sites: rows }
})
