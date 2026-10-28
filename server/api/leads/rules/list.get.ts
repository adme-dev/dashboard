// server/api/leads/rules/list.get.ts
// List observed forms and proactively configured rules. Rules must remain
// visible before their first live lead arrives, when no metadata row exists.

import { queryRows } from '~~/server/utils/db'
import { resolveMarketingLeadBrowserScope } from '~~/server/utils/leads/followupAccess'

export default defineEventHandler(async (event) => {
  const { marketing } = await resolveMarketingLeadBrowserScope(event)
  const rows = await queryRows(`
    SELECT
      COALESCE(m.source, r.source) AS source,
      COALESCE(m.form_id, r.form_id) AS form_id,
      COALESCE(m.form_name, r.form_name) AS form_name,
      r.id AS rule_id, r.client_id, c.name AS client_name, r.enabled, r.updated_at,
      m.last_lead_at,
      (SELECT COUNT(*) FROM lead_rule_destinations d WHERE d.rule_id = r.id) AS destination_count
    FROM lead_form_metadata m
    FULL OUTER JOIN lead_form_rules r ON r.source = m.source AND r.form_id = m.form_id
    LEFT JOIN agency_clients c ON c.id = r.client_id
    ${marketing ? 'WHERE EXISTS (SELECT 1 FROM agency_clients active_client WHERE active_client.id=r.client_id AND active_client.is_active=TRUE)' : ''}
    ORDER BY m.last_lead_at DESC NULLS LAST, COALESCE(r.updated_at, m.updated_at) DESC
  `)
  return { items: rows }
})
