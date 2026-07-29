import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { safeEmailLeadPresentationSelect } from '~~/server/utils/leads/leadPresentation'

const PORTAL_VISIBLE_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`
const DUPLICATE_PORTAL_VISIBLE = `EXISTS (
  SELECT 1 FROM lead_form_rules duplicate_rule
  JOIN lead_rule_destinations duplicate_destination ON duplicate_destination.rule_id = duplicate_rule.id
  WHERE duplicate_rule.source = duplicate_lead.source
    AND duplicate_rule.form_id = duplicate_lead.form_id
    AND duplicate_rule.client_id = duplicate_lead.client_id
    AND duplicate_rule.enabled = TRUE
    AND duplicate_destination.destination_type = 'portal'
    AND duplicate_destination.enabled = TRUE
)`

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const lead = await queryOne(`
    SELECT l.id, l.source, l.form_name, l.submitted_at,
           l.field_data, l.attribution, l.status, l.contacted_at,
           l.campaign_name, l.ad_name, l.score, l.score_reasons,
           ${safeEmailLeadPresentationSelect('l', DUPLICATE_PORTAL_VISIBLE)}
    FROM leads l
    WHERE l.id = $1 AND l.client_id = $2 AND l.deleted_at IS NULL
      AND ${PORTAL_VISIBLE_EXISTS}
  `, [id, client.clientId])
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { lead }
})
