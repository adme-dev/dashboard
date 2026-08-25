import { queryRows } from '~~/server/utils/db'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'

export default defineEventHandler(async (event) => {
  const { row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const entries = await queryRows<any>(
    `SELECT e.id, e.status, e.status_reason, e.terms_version, e.answer, e.postcode, e.state, e.created_at, e.lead_id,
            l.field_data, c.code AS qr_code
     FROM qr_competition_entries e LEFT JOIN leads l ON l.id = e.lead_id LEFT JOIN qr_codes c ON c.id = e.qr_code_id
     WHERE e.competition_id = $1 ORDER BY e.created_at DESC LIMIT 5000`, [row.id])
  return { entries }
})
