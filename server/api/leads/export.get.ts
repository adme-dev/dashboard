// server/api/leads/export.get.ts
// CSV export honoring filter query params.

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function pushCondition(conds: string[], params: unknown[], condition: string, value: unknown) {
  params.push(value)
  conds.push(`${condition} $${params.length}`)
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds: string[] = ['deleted_at IS NULL']
  const params: unknown[] = []
  if (q.client_id) pushCondition(conds, params, 'client_id =', q.client_id)
  if (q.unmapped === 'true') conds.push(`client_id IS NULL`)
  if (q.source) pushCondition(conds, params, 'source =', q.source)
  if (q.form_id) pushCondition(conds, params, 'form_id =', q.form_id)
  if (q.status) pushCondition(conds, params, 'status =', q.status)
  if (q.assigned_to) pushCondition(conds, params, 'assigned_to =', q.assigned_to)
  if (q.campaign_id) pushCondition(conds, params, 'campaign_id =', q.campaign_id)
  if (q.campaign_name) pushCondition(conds, params, 'campaign_name =', q.campaign_name)
  if (q.from) pushCondition(conds, params, 'submitted_at >=', q.from)
  if (q.to) {
    params.push(q.to)
    conds.push(`submitted_at < ($${params.length}::date + INTERVAL '1 day')`)
  }
  if (q.q) {
    const safe = String(q.q).replace(/[%_]/g, c => '\\' + c)
    params.push(`%${safe}%`)
    conds.push(`field_data::text ILIKE $${params.length}`)
  }
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT submitted_at, source, form_name, campaign_name, ad_name, status, assigned_to, client_id, field_data, attribution
     FROM leads WHERE ${conds.join(' AND ')}
     ORDER BY submitted_at DESC LIMIT 5000`,
    params
  )
  const header = ['submitted_at', 'source', 'form_name', 'campaign_name', 'ad_name', 'status', 'assigned_to', 'client_id', 'field_data', 'attribution']
  const lines = [header.join(',')]
  for (const r of rows) lines.push(header.map(h => esc(r[h])).join(','))
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition',
    `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`)
  return lines.join('\n')
})
