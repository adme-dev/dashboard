// server/api/ai/anomaly-detection.get.ts
//
// Backwards-compatibility shim.
// The page at /xeroflow consumes this endpoint via the AnomalyAlerts widget
// (app/components/dashboard/AnomalyAlerts.vue). The full computation has been
// migrated to the persisted detection layer (server/utils/anomalyDetection/);
// this handler now reads from the `anomalies` table and reshapes the output
// to the legacy contract the widget expects.
//
// When the dashboard widget is rewritten to consume /api/ai/anomalies directly
// (Phase 4 UI polish), this file can be deleted.

import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows, queryOne } from '~~/server/utils/db'

interface LegacyAnomaly {
  type: 'daily_spending' | 'category_spending' | 'vendor_spending' | 'timing_anomaly'
  severity: 'high' | 'medium' | 'low'
  amount: number
  message: string
  category?: string
  vendor?: string
  date?: string
}

const SEVERITY_MAP: Record<string, 'high' | 'medium' | 'low'> = {
  critical: 'high',
  warning: 'medium',
  info: 'low',
}

function legacyTypeFor(type: string, tags: string[] | null): LegacyAnomaly['type'] {
  const t = (tags || []).map(s => s.toLowerCase())
  if (type === 'expenses') {
    if (t.some(x => x.includes('daily'))) return 'daily_spending'
    if (t.some(x => x.includes('vendor'))) return 'vendor_spending'
    if (t.some(x => x.includes('concentration'))) return 'category_spending'
    return 'category_spending'
  }
  if (type === 'cashflow' || type === 'receivables') return 'timing_anomaly'
  return 'category_spending'
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  // Pull active anomalies for the tenant.
  const rows = await queryRows<{
    id: string
    type: string
    severity: string
    title: string
    description: string
    metric: { label?: string; value?: number; format?: string } | null
    context: { category?: string; vendor?: string; range?: { from?: string | null; to?: string | null } } | null
    tags: string[] | null
    first_detected_at: string
  }>(
    `SELECT id, type, severity, title, description, metric, context, tags, first_detected_at
     FROM anomalies
     WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed')
     ORDER BY (severity = 'critical') DESC, first_detected_at DESC
     LIMIT 50`,
    [tenantId],
  )

  const anomalies: LegacyAnomaly[] = rows.map(r => {
    const amount = typeof r.metric?.value === 'number' ? r.metric.value : 0
    return {
      type: legacyTypeFor(r.type, r.tags),
      severity: SEVERITY_MAP[r.severity] ?? 'low',
      amount,
      message: r.description,
      category: r.context?.category,
      vendor: r.context?.vendor,
      date: r.context?.range?.from || r.first_detected_at?.slice(0, 10),
    }
  })

  // Summary numbers — best-effort approximations of the legacy fields.
  // totalTransactions: there's no direct equivalent in the persisted layer.
  // We surface the count of all anomaly events recorded (a reasonable proxy
  // for "things looked at") so the widget's % calculation isn't divided by zero.
  const eventTotal = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM anomaly_events ae
     JOIN anomalies a ON a.id = ae.anomaly_id
     WHERE a.tenant_id = $1`,
    [tenantId],
  )
  const totalTransactions = Math.max(Number(eventTotal?.count ?? 0), anomalies.length)
  const anomaliesDetected = anomalies.length
  const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high').length
  const anomalyRate = totalTransactions > 0
    ? Math.round((anomaliesDetected / totalTransactions) * 100 * 100) / 100
    : 0

  return {
    summary: {
      totalTransactions,
      anomaliesDetected,
      highSeverityAnomalies,
      anomalyRate,
    },
    anomalies,
    insights: [], // legacy field, kept for compat — empty
  }
})
