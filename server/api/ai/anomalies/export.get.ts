// server/api/ai/anomalies/export.get.ts
import { defineEventHandler, getQuery, setHeader, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const q = getQuery(event)
  const tab = q.tab === 'history' ? 'history' : 'active'
  const status = q.status ? String(q.status) : null
  const severity = q.severity ? String(q.severity) : null
  const type = q.type ? String(q.type) : null

  const where: string[] = ['tenant_id = $1']
  const params: any[] = [tenantId]
  let i = 2

  if (status) {
    where.push(`status = $${i++}`); params.push(status)
  } else {
    const allowed = tab === 'history' ? ['resolved', 'dismissed'] : ['open', 'acknowledged', 'snoozed']
    where.push(`status = ANY($${i++})`); params.push(allowed)
  }
  if (severity) { where.push(`severity = $${i++}`); params.push(severity) }
  if (type) { where.push(`type = $${i++}`); params.push(type) }

  const rows = await queryRows<any>(
    `SELECT type, severity, status, title, description, fingerprint,
            first_detected_at, last_detected_at, resolved_at, snoozed_until
     FROM anomalies WHERE ${where.join(' AND ')}
     ORDER BY first_detected_at DESC LIMIT 5000`,
    params,
  )

  const cols = ['type', 'severity', 'status', 'title', 'description', 'fingerprint',
    'first_detected_at', 'last_detected_at', 'resolved_at', 'snoozed_until']
  const csv = [
    cols.join(','),
    ...rows.map(r => cols.map(c => csvEscape(r[c])).join(',')),
  ].join('\n')

  const filename = `anomalies-${new Date().toISOString().slice(0, 10)}.csv`
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  return csv
})

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
