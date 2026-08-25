import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { ANALYTICS_ROLES, accessibleClientIds, isUuid } from '~~/server/utils/client-access'
import { parseCompetitionRow } from '~~/server/utils/qr/competitions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  const q = getQuery(event)
  const params: unknown[] = []
  const where: string[] = []
  const scope = await accessibleClientIds(user)
  if (scope) { params.push(scope); where.push(`c.client_id = ANY($${params.length}::uuid[])`) }
  if (isUuid(q.clientId as string)) { params.push(q.clientId); where.push(`c.client_id = $${params.length}`) }
  const rows = await queryRows<any>(
    `SELECT c.*, cl.name AS client_name,
       (SELECT COUNT(*)::int FROM qr_competition_entries e WHERE e.competition_id = c.id) AS entries_count,
       (SELECT COUNT(*)::int FROM qr_pages p WHERE p.competition_id = c.id) AS pages_count
     FROM qr_competitions c JOIN agency_clients cl ON cl.id = c.client_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC LIMIT 200`, params)
  return { competitions: rows.map(r => ({ ...parseCompetitionRow(r), client_name: r.client_name, entries_count: r.entries_count, pages_count: r.pages_count })) }
})
