// server/api/client-portal/leads/list.get.ts
// Client portal: filtered to client + portal-visible only.
// Visibility rule: client portal sees a lead iff at least one of the form's
// destinations is type='portal' AND enabled.

import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds = [
    'l.deleted_at IS NULL',
    'l.client_id = $1',
    `EXISTS (
      SELECT 1 FROM lead_form_rules r
      JOIN lead_rule_destinations d ON d.rule_id = r.id
      WHERE r.source = l.source AND r.form_id = l.form_id
        AND d.destination_type = 'portal' AND d.enabled = TRUE
    )`,
  ]
  const params: any[] = [client.clientId]
  if (q.status) { params.push(q.status); conds.push(`l.status = $${params.length}`) }
  if (q.from) { params.push(q.from); conds.push(`l.submitted_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`l.submitted_at <= $${params.length}`) }
  const page = Math.max(1, parseInt(q.page ?? '1'))
  const ps = Math.min(200, Math.max(1, parseInt(q.page_size ?? '50')))
  const offset = (page - 1) * ps
  const items = await queryRows(
    `SELECT l.id, l.source, l.form_name, l.submitted_at, l.field_data, l.status, l.contacted_at
     FROM leads l WHERE ${conds.join(' AND ')}
     ORDER BY l.submitted_at DESC
     LIMIT ${ps} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(
    `SELECT COUNT(*)::text AS count FROM leads l WHERE ${conds.join(' AND ')}`,
    params,
  )
  return { items, total, page, page_size: ps }
})
