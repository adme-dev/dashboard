// server/api/ai/anomalies/index.get.ts
import { defineEventHandler, getQuery, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'
import type { AnomalyRow, AnomalyStatus, AnomalySeverity, AnomalyType } from '~~/server/utils/anomalyDetection/types'

const ACTIVE_STATUSES: AnomalyStatus[] = ['open', 'acknowledged', 'snoozed']
const HISTORY_STATUSES: AnomalyStatus[] = ['resolved', 'dismissed']

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const q = getQuery(event)
  const tab = q.tab === 'history' ? 'history' : 'active'
  const status = q.status ? String(q.status) as AnomalyStatus : null
  const severity = q.severity ? String(q.severity) as AnomalySeverity : null
  const type = q.type ? String(q.type) as AnomalyType : null
  const from = q.from ? String(q.from) : null
  const to = q.to ? String(q.to) : null

  const where: string[] = ['tenant_id = $1']
  const params: any[] = [tenantId]
  let i = 2

  if (status) {
    where.push(`status = $${i++}`); params.push(status)
  } else {
    const allowed = tab === 'history' ? HISTORY_STATUSES : ACTIVE_STATUSES
    where.push(`status = ANY($${i++})`); params.push(allowed)
  }
  if (severity) { where.push(`severity = $${i++}`); params.push(severity) }
  if (type) { where.push(`type = $${i++}`); params.push(type) }
  if (from) { where.push(`first_detected_at >= $${i++}`); params.push(from) }
  if (to) { where.push(`first_detected_at <= $${i++}`); params.push(to) }

  const rows = await queryRows<AnomalyRow>(
    `SELECT * FROM anomalies WHERE ${where.join(' AND ')}
     ORDER BY (severity = 'critical') DESC, first_detected_at DESC
     LIMIT 500`,
    params,
  )

  const summaryRows = await queryRows<{ severity: AnomalySeverity; count: string }>(
    `SELECT severity, COUNT(*)::text AS count FROM anomalies
     WHERE tenant_id = $1 AND status = ANY($2) GROUP BY severity`,
    [tenantId, ACTIVE_STATUSES],
  )

  const bySeverity = { critical: 0, warning: 0, info: 0 } as Record<AnomalySeverity, number>
  for (const r of summaryRows) bySeverity[r.severity] = Number(r.count)

  return {
    anomalies: rows,
    summary: {
      total: rows.length,
      bySeverity,
      generatedAt: new Date().toISOString(),
    },
  }
})
