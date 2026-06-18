// server/utils/anomalyDetection/analysers/clients.ts
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

interface ClientRow {
  client_id: string
  client_name: string
  invoiced: number | string
  time_value: number | string
  period_start: string
  period_end: string
}

export const clientsAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.clientRevenue as ClientRow[] | null
  if (!rows || rows.length === 0) return []

  const out: DetectedAnomaly[] = []
  const totalInvoiced = rows.reduce((s, r) => s + Number(r.invoiced || 0), 0)
  const firstRow = rows[0]
  if (!firstRow) return []
  const periodLabel = `${firstRow.period_start} → ${firstRow.period_end}`

  for (const r of rows) {
    const invoiced = Number(r.invoiced || 0)
    const timeValue = Number(r.time_value || 0)

    // Rule 1: scope creep (time tracked > 1.5× invoiced).
    // Only fire when we have meaningful invoiced AND time data.
    if (invoiced > 100 && timeValue > 0) {
      const ratio = timeValue / invoiced
      if (ratio >= 1.5) {
        out.push({
          fingerprint: buildFingerprint('clients', `scope-creep-${r.client_id}`),
          type: 'clients',
          severity: ratio >= 2.5 ? 'critical' : 'warning',
          title: `${r.client_name} — time tracked exceeds invoiced`,
          description: `Tracked $${timeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} of billable time but invoiced only $${invoiced.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${ratio.toFixed(1)}×).`,
          metric: { label: 'Time Value', value: timeValue, format: 'currency' },
          comparison: { label: 'Invoiced', value: invoiced, format: 'currency', trend: 'down' },
          context: { client: r.client_name, period: periodLabel },
          recommendation: 'Review scope vs. retainer. Consider raising rates, capping non-billable time, or escalating with the client.',
          tags: ['client', 'scope creep'],
          dataSources: ['Time Entries', 'Invoices'],
        })
      }
    }

    // Rule 2: revenue concentration.
    if (totalInvoiced > 0 && invoiced / totalInvoiced > 0.4) {
      out.push({
        fingerprint: buildFingerprint('clients', `concentration-${r.client_id}`),
        type: 'clients',
        severity: 'warning',
        title: `${r.client_name} revenue concentration`,
        description: `${r.client_name} is ${Math.round(invoiced / totalInvoiced * 100)}% of period revenue ($${invoiced.toLocaleString(undefined, { maximumFractionDigits: 0 })} of $${totalInvoiced.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`,
        metric: { label: r.client_name, value: invoiced, format: 'currency' },
        comparison: { label: 'Total Revenue', value: totalInvoiced, format: 'currency', trend: 'up' },
        context: { client: r.client_name, period: periodLabel },
        recommendation: 'Diversify the client base; loss of this client would be material to revenue.',
        tags: ['client', 'concentration'],
        dataSources: ['Invoices'],
      })
    }
  }

  return out
}
