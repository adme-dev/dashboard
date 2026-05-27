import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const PORTAL_VISIBLE_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const lead = await queryOne(`
    SELECT l.id, l.source, l.form_name, l.submitted_at,
           l.field_data, l.attribution, l.status, l.contacted_at,
           l.campaign_name, l.ad_name, l.score, l.score_reasons
    FROM leads l
    WHERE l.id = $1 AND l.client_id = $2 AND l.deleted_at IS NULL
      AND ${PORTAL_VISIBLE_EXISTS}
  `, [id, client.clientId])
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { lead }
})
