import { requireAuth } from '~~/server/utils/auth'
import { loadLead } from '~~/server/utils/leads/db'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const lead = await loadLead(id)
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const deliveries = await queryRows(
    `SELECT * FROM lead_deliveries WHERE lead_id = $1 ORDER BY created_at ASC`, [id],
  )
  return { lead, deliveries }
})
