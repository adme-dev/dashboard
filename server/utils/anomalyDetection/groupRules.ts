// server/utils/anomalyDetection/groupRules.ts
import type { DetectedAnomaly } from './types'

const PROFITABILITY_FPS = new Set([
  'profitability:net-loss',
  'profitability:low-margin',
  'profitability:margin-compression',
  'revenue:revenue-decline',
  'revenue:yoy-decline',
])

const BUDGET_FPS = new Set([
  'budget:overspend-critical',
  'budget:overspend-warning',
  'budget:projected-overspend',
  'budget:multiple-overruns',
])
const BUDGET_PREFIX = 'budget:cat-'

const LIQUIDITY_FPS = new Set([
  'cashflow:high-burn-rate',
  'cashflow:low-cash-reserves',
  'cashflow:shortfall-projected',
])

/**
 * Assigns shared `groupKey` to correlated findings so the UI can collapse them
 * under one parent incident.
 *
 * A group key is assigned to every period-bucket within a cluster type when
 * the cluster type has ≥2 findings in total across the dataset. A single
 * isolated finding (cluster total = 1) is not a meaningful "incident" and
 * receives no group key.
 *
 * Different periods within the same cluster produce separate incident keys, so
 * the UI can surface them as distinct events.
 *
 * Cluster definitions:
 *   - profitability:  any combination of {net-loss, low-margin, margin-compression,
 *                     revenue-decline, yoy-decline} sharing context.period
 *   - budget:         any combination of {overspend-*, projected-overspend,
 *                     multiple-overruns} OR budget:cat-* sharing context.period
 *   - liquidity:      any combination of {high-burn-rate, low-cash-reserves,
 *                     shortfall-projected} sharing context.period
 */
export function applyGroupRules(anomalies: DetectedAnomaly[]): void {
  applyClusterByPeriod(
    anomalies,
    a => PROFITABILITY_FPS.has(a.fingerprint),
    period => `incident:profitability:${period}`,
  )
  applyClusterByPeriod(
    anomalies,
    a => BUDGET_FPS.has(a.fingerprint) || a.fingerprint.startsWith(BUDGET_PREFIX),
    period => `incident:budget:${period}`,
  )
  applyClusterByPeriod(
    anomalies,
    a => LIQUIDITY_FPS.has(a.fingerprint),
    period => `incident:liquidity:${period}`,
  )
}

function applyClusterByPeriod(
  anomalies: DetectedAnomaly[],
  matches: (a: DetectedAnomaly) => boolean,
  keyFor: (period: string) => string,
): void {
  // Group candidate anomalies by their context.period.
  const buckets = new Map<string, DetectedAnomaly[]>()
  for (const a of anomalies) {
    const period = a.context?.period
    if (!period || !matches(a)) continue
    if (!buckets.has(period)) buckets.set(period, [])
    buckets.get(period)!.push(a)
  }
  // A single isolated finding across the entire cluster is not an incident.
  const totalClusterSize = [...buckets.values()].reduce((sum, items) => sum + items.length, 0)
  if (totalClusterSize < 2) return
  // Assign period-specific group keys to every bucket (each period = its own incident).
  for (const [period, items] of buckets) {
    const groupKey = keyFor(period)
    for (const a of items) a.groupKey = groupKey
  }
}
