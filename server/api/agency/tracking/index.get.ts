/** List tracking sites (optionally ?clientId=). GET /api/agency/tracking */
import { query } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const { clientId } = getQuery(event) as { clientId?: string }
  const rows = await query(
    `SELECT s.*, (
        SELECT COUNT(*) FROM tracking_events e
         WHERE e.site_id = s.id AND e.received_at > NOW() - INTERVAL '24 hours'
      ) AS events_24h
       FROM tracking_sites s
      ${clientId ? 'WHERE s.client_id = $1' : ''}
      ORDER BY s.created_at DESC`,
    clientId ? [clientId] : []
  )
  return { sites: rows }
})
