// server/utils/anomalyDetection/analysers/receivables.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toCurrency = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

export async function receivablesAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const aging = ctx.data.aging
  if (!aging) return []

  const out: DetectedAnomaly[] = []

  const totalOutstanding = aging.totalOutstanding ?? 0
  const criticalAmount = aging.criticalAmount ?? 0
  const avgDaysPastDue = aging.averageDaysPastDue ?? 0
  const agingSummary = aging.agingSummary || []
  const topContacts = aging.topContacts || []

  // Overdue spike
  if (totalOutstanding > 0 && criticalAmount / totalOutstanding > 0.4) {
    out.push({
      fingerprint: buildFingerprint('receivables', 'overdue-spike'),
      type: 'receivables',
      severity: 'critical',
      title: 'Critical overdue receivables',
      description: `$${criticalAmount.toFixed(0)} in critical overdue invoices — ${Math.round(criticalAmount / totalOutstanding * 100)}% of all outstanding receivables.`,
      metric: { label: 'Critical Overdue', value: toCurrency(criticalAmount), format: 'currency' },
      comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'down' },
      recommendation: 'Escalate collection efforts on overdue accounts. Consider offering settlement discounts for immediate payment.',
      tags: ['overdue', 'collections'],
      dataSources: ['Aging Report'],
    })
  }

  // Aging concentration — 90+ bucket > 30% of outstanding
  const bucket90Plus = agingSummary.find((b: any) => b.bucket === '90+')
  if (bucket90Plus && totalOutstanding > 0 && bucket90Plus.amount / totalOutstanding > 0.3) {
    out.push({
      fingerprint: buildFingerprint('receivables', 'aging-concentration'),
      type: 'receivables',
      severity: 'warning',
      title: 'Aging concentration in 90+ days',
      description: `$${bucket90Plus.amount.toFixed(0)} (${bucket90Plus.percentage?.toFixed(0) || Math.round(bucket90Plus.amount / totalOutstanding * 100)}%) of receivables are aged over 90 days.`,
      metric: { label: '90+ Days', value: toCurrency(bucket90Plus.amount), format: 'currency' },
      comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'up' },
      recommendation: 'Review aged receivables for write-off candidates and intensify collection for recoverable amounts.',
      tags: ['aging', '90+ days'],
      dataSources: ['Aging Report'],
    })
  }

  // Slow payer risk
  if (avgDaysPastDue > 45) {
    out.push({
      fingerprint: buildFingerprint('receivables', 'slow-payer-risk'),
      type: 'receivables',
      severity: 'info',
      title: 'Slow payer trend',
      description: `Average days past due is ${Math.round(avgDaysPastDue)} days — well above the 30-day standard.`,
      metric: { label: 'Avg Days Past Due', value: Math.round(avgDaysPastDue), format: 'number' },
      recommendation: 'Review payment terms, consider early-payment incentives, or tighten credit policies for slow payers.',
      tags: ['payment terms', 'slow payers'],
      dataSources: ['Aging Report'],
    })
  }

  // Client concentration
  if (topContacts.length > 0 && totalOutstanding > 0) {
    const topClient = topContacts[0]
    const topClientShare = topClient.amount / totalOutstanding
    if (topClientShare > 0.5) {
      out.push({
        fingerprint: buildFingerprint('receivables', 'client-concentration'),
        type: 'receivables',
        severity: 'warning',
        title: 'Client concentration risk',
        description: `${topClient.name} represents ${Math.round(topClientShare * 100)}% of all outstanding receivables ($${topClient.amount.toFixed(0)}).`,
        metric: { label: topClient.name, value: toCurrency(topClient.amount), format: 'currency' },
        comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'up' },
        recommendation: 'Diversify the client base and ensure this client has strong credit standing. Monitor their payment patterns closely.',
        tags: ['concentration', 'client risk'],
        dataSources: ['Aging Report'],
      })
    }
  }

  return out
}
