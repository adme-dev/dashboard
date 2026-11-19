// Orchestrates one marketing-alerts pass: config gate → detectors → persist (dedupe/resolve) →
// deliver. Dependencies are injectable so tests exercise the whole pass without a database,
// Slack or the notifications table.
import type { MarketingAlertsConfig } from './config'
import type { DeliveryResult } from './delivery'
import {
  detectBudgetPacing,
  detectGooglePolicy,
  detectOpenAnomalies,
  detectSpendSyncFailures,
  detectWastedSearchTerms,
  type AnomalyRow,
  type PacingRow,
  type PolicyAdRow,
  type PolicyCampaignRow,
  type SearchTermRow,
  type SyncJobRow
} from './detectors'
import { SEVERITY_RANK, type DetectedMarketingAlert, type MarketingAlertSource, type StoredMarketingAlert } from './types'

export interface MarketingAlertsSourceLoaders {
  pacing: (period: string) => Promise<PacingRow[]>
  anomalies: () => Promise<AnomalyRow[]>
  policy: (period: string) => Promise<{ campaigns: PolicyCampaignRow[], ads: PolicyAdRow[] }>
  syncJobs: () => Promise<SyncJobRow[]>
  searchTerms: (period: string, config: MarketingAlertsConfig) => Promise<SearchTermRow[]>
}

export interface MarketingAlertsStore {
  upsert: (alerts: DetectedMarketingAlert[]) => Promise<{ opened: number, refreshed: number }>
  resolveCleared: (sources: MarketingAlertSource[], openKeys: string[]) => Promise<number>
  listOpen: () => Promise<StoredMarketingAlert[]>
}

export interface MarketingAlertsRunDeps {
  loadConfig: () => Promise<MarketingAlertsConfig>
  sources: MarketingAlertsSourceLoaders
  store: MarketingAlertsStore
  /** Built lazily so a dormant run never touches delivery plumbing. */
  delivery: (open: StoredMarketingAlert[], ctx: { config: MarketingAlertsConfig, now: Date, localHour: number, localDateLabel: string }) => Promise<DeliveryResult>
}

export type MarketingAlertsRunResult
  = | { ok: true, skipped: 'disabled' }
    | {
      ok: true
      detected: number
      opened: number
      refreshed: number
      resolved: number
      open: number
      bySource: Partial<Record<MarketingAlertSource, number>>
      sourceErrors: Partial<Record<MarketingAlertSource, string>>
      delivery: DeliveryResult
    }

export function localClock(now: Date, timezone: string): { hour: number, date: string, label: string, period: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map(p => [p.type, p.value])
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return {
    hour: Number(parts.hour) % 24,
    date,
    period: `${parts.year}-${parts.month}`,
    label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
}

/** Collapse duplicate keys (keeping the most severe) so one upsert never touches a row twice. */
export function dedupeDetected(alerts: DetectedMarketingAlert[]): DetectedMarketingAlert[] {
  const byKey = new Map<string, DetectedMarketingAlert>()
  for (const alert of alerts) {
    const existing = byKey.get(alert.dedupeKey)
    if (!existing || SEVERITY_RANK[alert.severity] < SEVERITY_RANK[existing.severity]) byKey.set(alert.dedupeKey, alert)
  }
  return [...byKey.values()]
}

export async function runMarketingAlerts(deps: MarketingAlertsRunDeps, now = new Date()): Promise<MarketingAlertsRunResult> {
  const config = await deps.loadConfig()
  if (!config.enabled) return { ok: true, skipped: 'disabled' }

  const clock = localClock(now, config.timezone)
  const t = config.thresholds
  const detected: DetectedMarketingAlert[] = []
  const evaluated: MarketingAlertSource[] = []
  const sourceErrors: Partial<Record<MarketingAlertSource, string>> = {}

  const run = async (source: MarketingAlertSource, fn: () => Promise<DetectedMarketingAlert[]>) => {
    try {
      detected.push(...await fn())
      evaluated.push(source)
    } catch (err) {
      // A failed source keeps its existing open alerts (never mass-resolved by a query error).
      sourceErrors[source] = err instanceof Error ? err.message.slice(0, 200) : String(err)
      console.error('[marketing-alerts] source failed', { source, error: sourceErrors[source] })
    }
  }

  await run('budget_pacing', async () => detectBudgetPacing(await deps.sources.pacing(clock.period), { period: clock.period, now, thresholds: t }))
  await run('anomaly', async () => detectOpenAnomalies(await deps.sources.anomalies()))
  await run('google_policy', async () => {
    const rows = await deps.sources.policy(clock.period)
    return detectGooglePolicy(rows.campaigns, rows.ads)
  })
  await run('spend_sync', async () => detectSpendSyncFailures(await deps.sources.syncJobs(), { now, thresholds: t }))
  await run('search_terms', async () => detectWastedSearchTerms(await deps.sources.searchTerms(clock.period, config), t))

  const unique = dedupeDetected(detected)
  const { opened, refreshed } = await deps.store.upsert(unique)
  const resolved = await deps.store.resolveCleared(evaluated, unique.map(a => a.dedupeKey))
  const open = await deps.store.listOpen()
  const delivery = await deps.delivery(open, { config, now, localHour: clock.hour, localDateLabel: clock.label })

  const bySource: Partial<Record<MarketingAlertSource, number>> = {}
  for (const alert of open) bySource[alert.source] = (bySource[alert.source] ?? 0) + 1

  return { ok: true, detected: unique.length, opened, refreshed, resolved, open: open.length, bySource, sourceErrors, delivery }
}
