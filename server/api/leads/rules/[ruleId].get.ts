import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'ruleId')!
  const rule = await queryOne(`SELECT * FROM lead_form_rules WHERE id = $1`, [ruleId])
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const destinations = await queryRows(
    `SELECT * FROM lead_rule_destinations WHERE rule_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [ruleId],
  )
  return { rule, destinations }
})
