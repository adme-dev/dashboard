// server/api/leads/rules/list.get.ts
// List (client × form) combinations seen in the wild + their rule status.

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const rows = await queryRows(`
    SELECT
      m.source, m.form_id, m.form_name,
      r.id AS rule_id, r.client_id, r.enabled, r.updated_at,
      m.last_lead_at,
      (SELECT COUNT(*) FROM lead_rule_destinations d WHERE d.rule_id = r.id) AS destination_count
    FROM lead_form_metadata m
    LEFT JOIN lead_form_rules r ON r.source = m.source AND r.form_id = m.form_id
    ORDER BY m.last_lead_at DESC NULLS LAST
  `)
  return { items: rows }
})
