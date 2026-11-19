import { describe, expect, it } from 'vitest'
import {
  detectBudgetPacing,
  detectGooglePolicy,
  detectOpenAnomalies,
  detectSpendSyncFailures,
  detectWastedSearchTerms,
  type PacingRow,
  type SearchTermRow
} from '~~/server/utils/marketingAlerts/detectors'
import { mergeMarketingAlertsConfig } from '~~/server/utils/marketingAlerts/config'
import type { DetectedMarketingAlert } from '~~/server/utils/marketingAlerts/types'

const thresholds = mergeMarketingAlertsConfig(null).thresholds
// Day 20 of a 30-day month (local midday) → 66.7% elapsed.
const now = new Date(2026, 10, 20, 12, 0, 0)
const period = '2026-11'
const recent = new Date(now.getTime() - 2 * 3_600_000).toISOString()

const pacingRow = (over: Partial<PacingRow>): PacingRow => ({
  media_spend_id: 'ms-1',
  client_id: '11111111-1111-4111-8111-111111111111',
  client_name: 'Northern Nissan',
  platform: 'google_ads',
  account_id: '123-456-7890',
  account_name: 'NN Google',
  campaign_id: 'c-1',
  campaign_name: 'Search - Brand',
  campaign_status: 'ENABLED',
  end_date: null,
  budget_rolling: false,
  monthly_budget: 3000,
  mtd_spend: 2000,
  spend_as_of: '2026-11-20',
  synced_at: recent,
  ...over
})

/** Every alert must be notify-only and fully described. */
function expectWellFormed(alert: DetectedMarketingAlert) {
  expect(alert.dedupeKey).toMatch(/\S+:\S+/)
  expect(alert.summary.length).toBeGreaterThan(10)
  expect(alert.deepLink.startsWith('/')).toBe(true)
  expect(alert.nextStep).toMatch(/^Ask Claude: /)
  expect(alert.nextStep).toContain(alert.mcpTool)
  // The suggested next step is a question, never an action tool.
  expect(alert.mcpTool).not.toMatch(/^(propose_|google_ads_plan_|confirm_action|run_)/)
}

describe('budget pacing detector', () => {
  it('flags critical over-pacing, warning over-pacing, under-pacing and no budget set', () => {
    const alerts = detectBudgetPacing([
      pacingRow({ media_spend_id: 'crit', mtd_spend: 2700 }), // 90% of budget at 66.7% → 1.35×
      pacingRow({ media_spend_id: 'warn', mtd_spend: 2300 }), // 76.7% → 1.15×
      pacingRow({ media_spend_id: 'under', mtd_spend: 1000 }), // 33% → 0.5×
      pacingRow({ media_spend_id: 'ok', mtd_spend: 2000 }), // 1.0×
      pacingRow({ media_spend_id: 'nobudget', monthly_budget: 0, mtd_spend: 400 }),
      pacingRow({ media_spend_id: 'nobudget-tiny', monthly_budget: 0, mtd_spend: 10 })
    ], { period, now, thresholds })
    const byId = Object.fromEntries(alerts.map(a => [a.evidence.mediaSpendId, a]))
    expect(byId.crit).toMatchObject({ kind: 'over_pacing', severity: 'critical', dedupeKey: 'pacing:over_pacing:crit:2026-11' })
    expect(byId.warn).toMatchObject({ kind: 'over_pacing', severity: 'warning', dedupeKey: 'pacing:over_pacing:warn:2026-11' })
    expect(byId.under).toMatchObject({ kind: 'under_pacing', severity: 'warning' })
    expect(byId.nobudget).toMatchObject({ kind: 'no_budget', severity: 'warning' })
    expect(byId.ok).toBeUndefined()
    expect(byId['nobudget-tiny']).toBeUndefined()
    expect(byId.crit!.summary).toContain('Northern Nissan')
    alerts.forEach(expectWellFormed)
  })

  it('keeps the dedupe key stable when a warning escalates to critical', () => {
    const warn = detectBudgetPacing([pacingRow({ mtd_spend: 2300 })], { period, now, thresholds })[0]!
    const crit = detectBudgetPacing([pacingRow({ mtd_spend: 2800 })], { period, now, thresholds })[0]!
    expect(warn.dedupeKey).toBe(crit.dedupeKey)
    expect([warn.severity, crit.severity]).toEqual(['warning', 'critical'])
  })

  it('skips stale rows, ended campaigns, rolling budgets and under-pacing on paused campaigns', () => {
    const stale = new Date(now.getTime() - 72 * 3_600_000).toISOString()
    expect(detectBudgetPacing([
      pacingRow({ media_spend_id: 'stale', mtd_spend: 2900, synced_at: stale }),
      pacingRow({ media_spend_id: 'ended', mtd_spend: 2900, end_date: '2026-11-01' }),
      pacingRow({ media_spend_id: 'rolling', mtd_spend: 2900, budget_rolling: true }),
      pacingRow({ media_spend_id: 'paused', mtd_spend: 500, campaign_status: 'PAUSED' })
    ], { period, now, thresholds })).toEqual([])
  })

  it('honours configured thresholds', () => {
    const strict = { ...thresholds, overPacingWarningRatio: 1.01, overPacingCriticalRatio: 1.05 }
    expect(detectBudgetPacing([pacingRow({ mtd_spend: 2100 })], { period, now, thresholds: strict })[0]).toMatchObject({ severity: 'critical' })
  })
})

describe('anomaly detector', () => {
  it('routes open marketing anomalies and skips ones the pacing detector already covers', () => {
    const alerts = detectOpenAnomalies([
      { id: 'a1', type: 'adspend', severity: 'critical', title: 'Spend but no leads', description: 'NN spent $900 with 0 leads', fingerprint: 'adspend:spend-no-leads-ms1-2026-11', client_id: null, client_name: 'Northern Nissan', platform: 'google_ads' },
      { id: 'a2', type: 'adspend', severity: 'warning', title: 'No budget', description: null, fingerprint: 'adspend:budget-unset-ms1-2026-11', client_id: null, client_name: 'NN', platform: 'google_ads' },
      { id: 'a3', type: 'ga4', severity: 'info', title: 'Mix', description: null, fingerprint: 'ga4:mix-1', client_id: null, client_name: null, platform: null }
    ])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ dedupeKey: 'anomaly:a1', severity: 'critical', source: 'anomaly', mcpTool: 'get_open_anomalies' })
    alerts.forEach(expectWellFormed)
  })
})

describe('Google policy detector', () => {
  it('raises warnings for policy-limited campaigns/ads and info for budget-limited campaigns', () => {
    const alerts = detectGooglePolicy([
      { media_spend_id: 'p1', client_id: null, client_name: 'Waverley Foton', account_id: '1', campaign_id: 'pmax', campaign_name: 'PMax', campaign_status: 'ENABLED', serving_status: 'LIMITED', reasons: ['HAS_ASSET_GROUPS_LIMITED_BY_POLICY', 'BUDGET_CONSTRAINED'] },
      { media_spend_id: 'p2', client_id: null, client_name: 'X', account_id: '1', campaign_id: 's', campaign_name: 'Search', campaign_status: 'ENABLED', serving_status: 'LIMITED', reasons: ['LIMITED_BY_BUDGET'] },
      { media_spend_id: 'p3', client_id: null, client_name: 'X', account_id: '1', campaign_id: 'old', campaign_name: 'Old', campaign_status: 'PAUSED', serving_status: 'PAUSED', reasons: ['HAS_ASSET_GROUPS_LIMITED_BY_POLICY'] }
    ], [
      { media_spend_id: 'p1', client_id: null, client_name: 'Waverley Foton', account_id: '1', campaign_id: 'pmax', campaign_name: 'PMax', ad_id: 'ad9', ad_name: 'RSA 1', approval_status: 'DISAPPROVED', policy_issues: [{ topic: 'TRADEMARKS' }] },
      { media_spend_id: 'p1', client_id: null, client_name: 'Waverley Foton', account_id: '1', campaign_id: 'pmax', campaign_name: 'PMax', ad_id: 'ad8', ad_name: 'RSA 2', approval_status: 'APPROVED', policy_issues: null }
    ])
    const keys = alerts.map(a => `${a.dedupeKey}|${a.severity}`).sort()
    expect(keys).toEqual([
      'policy:ad:p1:ad9|warning',
      'policy:budget_limited:p1|info',
      'policy:budget_limited:p2|info',
      'policy:campaign:p1|warning'
    ])
    expect(alerts.find(a => a.dedupeKey === 'policy:campaign:p1')!.summary).toContain('HAS_ASSET_GROUPS_LIMITED_BY_POLICY')
    alerts.forEach(expectWellFormed)
  })
})

describe('spend-sync detector', () => {
  const job = { status: 'completed', error: null, coverage_failed: false, started_at: recent, last_success_at: recent }
  it('classifies Google 403 manager-link loss as critical and Meta coverage halts as warnings, one per account', () => {
    const alerts = detectSpendSyncFailures([
      { ...job, platform: 'google', failures: [
        { account: 'Caravan Hire Co', reason: 'Access denied (403) — check ad-account access / manager link' },
        { account: 'Caravan Hire Co', reason: 'Access denied (403) — check ad-account access / manager link' },
        { account: 'Traralgon Ssangyong', reason: 'Access denied (403) — check ad-account access / manager link' }
      ] },
      { ...job, platform: 'meta', status: 'failed', coverage_failed: true, error: 'Sync coverage verification failed', failures: [
        { account: 'Northern Nissan', reason: 'Coverage halt: returned 2 campaigns vs 5 on the previous successful run (-60%)' }
      ] },
      { ...job, platform: 'tiktok', failures: [{ account: 'x', reason: '403' }] }
    ], { now, thresholds })
    expect(alerts.map(a => `${a.dedupeKey}|${a.severity}`)).toEqual([
      'sync:google_ads:access_denied:caravan-hire-co|critical',
      'sync:google_ads:access_denied:traralgon-ssangyong|critical',
      'sync:meta:coverage_halt:northern-nissan|warning'
    ])
    alerts.forEach(expectWellFormed)
  })

  it('raises a critical staleness alert when a platform has not synced successfully in time', () => {
    const old = new Date(now.getTime() - 50 * 3_600_000).toISOString()
    const alerts = detectSpendSyncFailures([
      { ...job, platform: 'meta', failures: [], last_success_at: old },
      { ...job, platform: 'google', failures: [], last_success_at: null }
    ], { now, thresholds })
    expect(alerts.map(a => `${a.dedupeKey}|${a.severity}`)).toEqual(['sync:meta:stale|critical', 'sync:google_ads:stale|critical'])
    expect(alerts[1]!.summary).toContain('never synced')
  })

  it('reports a failed job with no per-account detail', () => {
    const alerts = detectSpendSyncFailures([{ ...job, platform: 'meta', status: 'failed', error: 'boom', failures: [] }], { now, thresholds })
    expect(alerts).toEqual([expect.objectContaining({ dedupeKey: 'sync:meta:job_failed', severity: 'warning' })])
  })
})

describe('wasted search-term detector', () => {
  const term = (over: Partial<SearchTermRow>): SearchTermRow => ({
    media_spend_id: 'st1', client_id: null, client_name: 'Garry and Warren Smith Suzuki', account_id: '9', campaign_id: 'c', campaign_name: 'Search - Generic',
    campaign_conversions: 0, search_term: 'free car', targeting_status: 'NONE', clicks: 10, cost: 60, range_start: '2026-11-01', range_end: '2026-11-18', ...over
  })
  it('alerts per campaign when unmanaged non-converting terms exceed the threshold', () => {
    const alerts = detectWastedSearchTerms([
      term({ search_term: 'free car', cost: 60 }),
      term({ search_term: 'suzuki jobs', cost: 45 }),
      term({ search_term: 'cheap', cost: 5 }), // below per-term threshold
      term({ search_term: 'swift', cost: 80, targeting_status: 'ADDED' }), // managed
      term({ media_spend_id: 'st2', search_term: 'x', cost: 500, campaign_conversions: 3 }), // campaign converts
      term({ media_spend_id: 'st3', search_term: 'y', cost: 50 }) // below campaign total
    ], thresholds)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ dedupeKey: 'search_terms:wasted:st1:2026-11-01', severity: 'warning', mcpTool: 'get_search_terms' })
    expect(alerts[0]!.evidence).toMatchObject({ wastedTotal: 105, termCount: 2 })
    expect(alerts[0]!.summary).toContain('"free car"')
    alerts.forEach(expectWellFormed)
  })
})
