// server/utils/anomalyDetection/analysers/adspend.ts
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

interface SpendRow {
  client_id: string
  client_name: string | null
  platform: string
  spend_date: string         // YYYY-MM-DD
  spend: number | string     // pg numeric → string sometimes
}

export const adspendAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.mediaSpend as SpendRow[] | null
  if (!rows || rows.length === 0) return []

  // Group by (client_id, platform).
  const groups = new Map<string, { rows: SpendRow[]; clientId: string; clientName: string; platform: string }>()
  for (const r of rows) {
    const key = `${r.client_id}:${r.platform}`
    if (!groups.has(key)) {
      groups.set(key, {
        rows: [],
        clientId: r.client_id,
        clientName: r.client_name ?? '(unknown client)',
        platform: r.platform,
      })
    }
    groups.get(key)!.rows.push(r)
  }

  const out: DetectedAnomaly[] = []

  for (const { rows: gRows, clientId, clientName, platform } of groups.values()) {
    if (gRows.length < 8) continue // need a stable baseline

    // Sort newest-first by spend_date string (ISO sortable).
    gRows.sort((a, b) => b.spend_date.localeCompare(a.spend_date))

    const todayRow = gRows[0]
    const baseline = gRows.slice(1, 31)
    if (baseline.length === 0) continue

    const todaySpend = Number(todayRow.spend)
    const avg = baseline.reduce((s, r) => s + Number(r.spend || 0), 0) / baseline.length
    if (avg <= 0 || todaySpend <= 0) continue

    const ratio = todaySpend / avg
    if (ratio < 2) continue

    const subKey = `spike-${clientId}-${platform}-${todayRow.spend_date}`
    out.push({
      fingerprint: buildFingerprint('adspend', subKey),
      type: 'adspend',
      severity: ratio >= 5 ? 'critical' : 'warning',
      title: `${clientName} (${platform}) spend spike`,
      description: `Spent $${todaySpend.toLocaleString()} on ${todayRow.spend_date} — ${ratio.toFixed(1)}× the 30-day average of $${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
      metric: { label: 'Day Spend', value: todaySpend, format: 'currency' },
      comparison: { label: '30-day Avg', value: avg, format: 'currency', trend: 'up' },
      context: { client: clientName, vendor: platform },
      recommendation: 'Review the campaign for delivery anomalies, frequency caps, or unintended audience expansion.',
      tags: ['ad spend', 'spike', platform],
      dataSources: ['Daily Spend'],
    })
  }

  return out
}
