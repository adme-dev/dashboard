// server/api/leads/export.get.ts
// CSV export honoring filter query params.

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

function esc(v: any): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds: string[] = ['deleted_at IS NULL']
  const params: any[] = []
  if (q.client_id) { params.push(q.client_id); conds.push(`client_id = $${params.length}`) }
  if (q.unmapped === 'true') conds.push(`client_id IS NULL`)
  if (q.source) { params.push(q.source); conds.push(`source = $${params.length}`) }
  if (q.form_id) { params.push(q.form_id); conds.push(`form_id = $${params.length}`) }
  if (q.status) { params.push(q.status); conds.push(`status = $${params.length}`) }
  if (q.assigned_to) { params.push(q.assigned_to); conds.push(`assigned_to = $${params.length}`) }
  if (q.from) { params.push(q.from); conds.push(`submitted_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`submitted_at < ($${params.length}::date + INTERVAL '1 day')`) }
  if (q.q) {
    const safe = String(q.q).replace(/[%_]/g, c => '\\' + c)
    params.push(`%${safe}%`)
    conds.push(`field_data::text ILIKE $${params.length}`)
  }
  const rows = await queryRows<any>(
    `SELECT submitted_at, source, form_name, status, assigned_to, client_id, field_data, attribution
     FROM leads WHERE ${conds.join(' AND ')}
     ORDER BY submitted_at DESC LIMIT 5000`,
    params,
  )
  const header = ['submitted_at', 'source', 'form_name', 'status', 'assigned_to', 'client_id', 'field_data', 'attribution']
  const lines = [header.join(',')]
  for (const r of rows) lines.push(header.map(h => esc(r[h])).join(','))
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition',
    `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`)
  return lines.join('\n')
})
