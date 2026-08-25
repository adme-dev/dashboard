/** List QR campaigns with code/scan/lead counts. GET /api/agency/qr-campaigns?clientId */
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { ANALYTICS_ROLES, accessibleClientIds, isUuid } from '~~/server/utils/client-access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  const q = getQuery(event)
  const params: unknown[] = []
  const where: string[] = []
  const scope = await accessibleClientIds(user)
  if (scope) {
    params.push(scope)
    where.push(`k.client_id = ANY($${params.length}::uuid[])`)
  }
  if (isUuid(q.clientId as string)) {
    params.push(q.clientId)
    where.push(`k.client_id = $${params.length}`)
  }
  const campaigns = await queryRows<any>(
    `SELECT k.*, cl.name AS client_name,
       (SELECT COUNT(*)::int FROM qr_codes c WHERE c.campaign_id = k.id) AS codes_count,
       (SELECT COALESCE(SUM(c.scan_count), 0)::int FROM qr_codes c WHERE c.campaign_id = k.id) AS scans,
       (SELECT COUNT(*)::int FROM leads l JOIN qr_codes c ON c.campaign_id = k.id AND l.client_id = c.client_id
          AND (l.attribution->>'xf_qr' = c.code OR l.attribution->>'utm_content' = c.code) WHERE l.deleted_at IS NULL) AS leads
     FROM qr_campaigns k JOIN agency_clients cl ON cl.id = k.client_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY k.updated_at DESC LIMIT 200`, params)
  return { campaigns }
})
