import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

function esc(v: any): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const rows = await queryRows<any>(
    `SELECT l.submitted_at, l.source, l.form_name, l.status, l.field_data
     FROM leads l WHERE l.client_id = $1 AND l.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM lead_form_rules r
         JOIN lead_rule_destinations d ON d.rule_id = r.id
         WHERE r.source = l.source AND r.form_id = l.form_id
           AND d.destination_type = 'portal' AND d.enabled = TRUE
       )
     ORDER BY l.submitted_at DESC LIMIT 5000`,
    [client.clientId],
  )
  const header = ['submitted_at', 'source', 'form_name', 'status', 'field_data']
  const lines = [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))]
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition',
    `attachment; filename="my-leads-${new Date().toISOString().slice(0, 10)}.csv"`)
  return lines.join('\n')
})
