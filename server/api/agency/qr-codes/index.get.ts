/** List QR codes. GET /api/agency/qr-codes?clientId&folderId&search */
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { ANALYTICS_ROLES, accessibleClientIds, isUuid } from '~~/server/utils/client-access'
import { shortUrl } from '~~/server/utils/qr/access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  const q = getQuery(event)
  const params: unknown[] = []
  const where: string[] = []
  const scope = await accessibleClientIds(user)
  if (scope) { params.push(scope); where.push(`c.client_id = ANY($${params.length}::uuid[])`) }
  if (isUuid(q.clientId as string)) { params.push(q.clientId); where.push(`c.client_id = $${params.length}`) }
  if (isUuid(q.folderId as string)) { params.push(q.folderId); where.push(`c.folder_id = $${params.length}`) }
  if (typeof q.search === 'string' && q.search.trim()) {
    params.push(`%${q.search.trim().replace(/[%_\\]/g, m => '\\' + m)}%`)
    where.push(`(c.name ILIKE $${params.length} ESCAPE '\\' OR c.destination_url ILIKE $${params.length} ESCAPE '\\')`)
  }
  const rows = await queryRows<any>(
    `SELECT c.*, cl.name AS client_name, f.name AS folder_name,
       COALESCE((SELECT json_agg(d.n ORDER BY d.day) FROM (
         SELECT g.day, COUNT(s.id) AS n
         FROM generate_series((CURRENT_DATE - 6)::date, CURRENT_DATE, '1 day') AS g(day)
         LEFT JOIN qr_scans s ON s.qr_code_id = c.id AND s.scanned_at::date = g.day
         GROUP BY g.day) d), '[]') AS sparkline
     FROM qr_codes c
     JOIN agency_clients cl ON cl.id = c.client_id
     LEFT JOIN qr_folders f ON f.id = c.folder_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.updated_at DESC LIMIT 500`, params)
  return { codes: rows.map(r => ({ ...r, short_url: shortUrl(r.code) })) }
})
