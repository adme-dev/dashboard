import { describe, expect, it, vi } from 'vitest'
import { mergeMarketingAlertsConfig, type MarketingAlertsConfig } from '~~/server/utils/marketingAlerts/config'
import { deliverMarketingAlerts, type DeliveryDeps } from '~~/server/utils/marketingAlerts/delivery'
import { dedupeDetected, localClock, runMarketingAlerts, type MarketingAlertsRunDeps } from '~~/server/utils/marketingAlerts/run'
import type { DetectedMarketingAlert, StoredMarketingAlert } from '~~/server/utils/marketingAlerts/types'
import { MARKETING_ALERTS_DEFAULTS } from '~~/shared/marketingAlertsDefaults'

const now = new Date('2026-11-19T22:30:00Z') // 09:30 Melbourne (AEDT), 20 Nov
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()

const stored = (id: string, over: Partial<StoredMarketingAlert> = {}): StoredMarketingAlert => ({
  id: `${id}0000000-0000-4000-8000-000000000000`.slice(0, 36),
  dedupeKey: `k:${id}`,
  source: 'spend_sync',
  kind: 'access_denied',
  severity: 'warning',
  clientId: null,
  clientName: 'Client',
  platform: 'google_ads',
  accountRef: 'acct',
  campaignRef: null,
  summary: `Summary <${id}> & co`,
  nextStep: 'Ask Claude: "status?" (read-only: get_sync_status)',
  mcpTool: 'get_sync_status',
  deepLink: '/agency/social/spend',
  evidence: {},
  firstDetectedAt: iso(1),
  severityChangedAt: null,
  immediateNotifiedAt: null,
  lastDigestAt: null,
  ...over
})

function config(over: Partial<MarketingAlertsConfig> = {}): MarketingAlertsConfig {
  return {
    ...mergeMarketingAlertsConfig({ enabled: true, delivery: { slack: true, inApp: true }, slack: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' }, recipientEmails: ['garrix@example.com'] }),
    ...over
  }
}

function deps(over: Partial<DeliveryDeps> = {}): DeliveryDeps & { [K in keyof DeliveryDeps]: ReturnType<typeof vi.fn> } {
  return {
    isPaused: vi.fn(() => false),
    postSlack: vi.fn(async () => ({ ok: true })),
    loadBudgetSlackWebhook: vi.fn(async () => ({ webhookUrl: null, channel: null })),
    resolveRecipientIds: vi.fn(async () => ['user-1']),
    notify: vi.fn(async () => ({ id: 'n1' })),
    recordDelivery: vi.fn(async () => {}),
    digestAlreadyHandled: vi.fn(async () => false),
    markImmediateNotified: vi.fn(async () => {}),
    markDigested: vi.fn(async () => {}),
    ...over
  } as never
}

const ctx = (cfg: MarketingAlertsConfig, localHour: number) => ({ config: cfg, now, appUrl: 'https://app.example', localHour, localDateLabel: '20 Nov 2026' })

describe('marketing alerts config + dormancy', () => {
  it('ships fully dormant: master switch and both channels off, no recipients, no webhook', () => {
    expect(MARKETING_ALERTS_DEFAULTS.enabled).toBe(false)
    const cfg = mergeMarketingAlertsConfig(undefined)
    expect(cfg).toMatchObject({ enabled: false, delivery: { slack: false, inApp: false }, recipientEmails: [], slack: { webhookUrl: null } })
  })

  it('only enables on an explicit boolean true and rejects non-Slack webhooks', () => {
    expect(mergeMarketingAlertsConfig({ enabled: 'true' }).enabled).toBe(false)
    expect(mergeMarketingAlertsConfig({ enabled: 1 }).enabled).toBe(false)
    expect(mergeMarketingAlertsConfig({ slack: { webhookUrl: 'https://evil.example/hook' } }).slack.webhookUrl).toBeNull()
    expect(mergeMarketingAlertsConfig({ timezone: 'Not/AZone', digestHour: 31 })).toMatchObject({ timezone: 'Australia/Melbourne', digestHour: 9 })
    expect(mergeMarketingAlertsConfig({ recipientEmails: ['A@X.com', 'bad', 'a@x.com'] }).recipientEmails).toEqual(['a@x.com'])
  })

  it('a disabled run reads nothing but its config, persists nothing and sends nothing', async () => {
    const sources = { pacing: vi.fn(), anomalies: vi.fn(), policy: vi.fn(), syncJobs: vi.fn(), searchTerms: vi.fn() }
    const store = { upsert: vi.fn(), resolveCleared: vi.fn(), listOpen: vi.fn() }
    const delivery = vi.fn()
    const result = await runMarketingAlerts({ loadConfig: async () => mergeMarketingAlertsConfig(null), sources, store, delivery } as never, now)
    expect(result).toEqual({ ok: true, skipped: 'disabled' })
    for (const fn of [...Object.values(sources), ...Object.values(store), delivery]) expect(fn).not.toHaveBeenCalled()
  })
})

describe('marketing alerts run', () => {
  const syncJobs = [{ platform: 'google', status: 'completed', error: null, coverage_failed: false, started_at: iso(1), last_success_at: iso(1),
    failures: [{ account: 'Caravan Hire Co', reason: 'Access denied (403) — check ad-account access / manager link' }] }]

  function runDeps(over: Partial<MarketingAlertsRunDeps['sources']> = {}) {
    const store = {
      upsert: vi.fn(async (alerts: DetectedMarketingAlert[]) => ({ opened: alerts.length, refreshed: 0 })),
      resolveCleared: vi.fn(async () => 0),
      listOpen: vi.fn(async () => [] as StoredMarketingAlert[])
    }
    const delivery = vi.fn(async () => ({ immediate: { eligible: 0, slack: 'off', inApp: 'off' }, digest: { due: false, alerts: 0, slack: 'off', inApp: 'off' } }) as never)
    const d: MarketingAlertsRunDeps = {
      loadConfig: async () => config(),
      sources: {
        pacing: vi.fn(async () => []),
        anomalies: vi.fn(async () => []),
        policy: vi.fn(async () => ({ campaigns: [], ads: [] })),
        syncJobs: vi.fn(async () => syncJobs),
        searchTerms: vi.fn(async () => []),
        ...over
      },
      store,
      delivery
    }
    return { d, store, delivery }
  }

  it('evaluates every source, persists, resolves cleared conditions per evaluated source and hands open alerts to delivery', async () => {
    const { d, store, delivery } = runDeps()
    const result = await runMarketingAlerts(d, now)
    expect(result).toMatchObject({ ok: true, detected: 1, opened: 1, sourceErrors: {} })
    expect(store.upsert.mock.calls[0]![0].map((a: DetectedMarketingAlert) => a.dedupeKey)).toEqual(['sync:google_ads:access_denied:caravan-hire-co'])
    expect(store.resolveCleared).toHaveBeenCalledWith(['budget_pacing', 'anomaly', 'google_policy', 'spend_sync', 'search_terms'], ['sync:google_ads:access_denied:caravan-hire-co'])
    expect(delivery).toHaveBeenCalledWith([], expect.objectContaining({ localHour: 9 }))
  })

  it('a failing source keeps its open alerts (never resolved by a query error) and is reported', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('relation missing')))
    const { d, store } = runDeps({ syncJobs: failing })
    const result = await runMarketingAlerts(d, now)
    expect(result).toMatchObject({ sourceErrors: { spend_sync: 'relation missing' } })
    expect(store.resolveCleared.mock.calls[0]![0]).not.toContain('spend_sync')
  })

  it('collapses duplicate dedupe keys to the most severe so one upsert never touches a row twice', () => {
    const base = { source: 'spend_sync', kind: 'k', clientId: null, clientName: null, platform: null, accountRef: null, campaignRef: null, summary: 's', nextStep: 'n', mcpTool: 't', deepLink: '/', evidence: {} } as const
    expect(dedupeDetected([
      { ...base, dedupeKey: 'x', severity: 'warning' },
      { ...base, dedupeKey: 'x', severity: 'critical' },
      { ...base, dedupeKey: 'y', severity: 'info' }
    ]).map(a => `${a.dedupeKey}|${a.severity}`)).toEqual(['x|critical', 'y|info'])
  })

  it('computes the tenant-local clock for digest gating and pacing period', () => {
    expect(localClock(now, 'Australia/Melbourne')).toMatchObject({ hour: 9, date: '2026-11-20', period: '2026-11' })
    expect(localClock(new Date('2026-11-30T14:00:00Z'), 'Australia/Melbourne')).toMatchObject({ date: '2026-12-01', period: '2026-12' })
  })
})

describe('marketing alerts delivery', () => {
  it('shadow mode (both channels off) sends and records nothing', async () => {
    const d = deps()
    const result = await deliverMarketingAlerts([stored('a', { severity: 'critical' })], ctx(config({ delivery: { slack: false, inApp: false } }), 9), d)
    expect(result.immediate.eligible).toBe(0)
    for (const fn of Object.values(d)) expect(fn).not.toHaveBeenCalled()
  })

  it('sends critical alerts immediately (once), but not warnings, outside the digest hour', async () => {
    const d = deps()
    const crit = stored('a', { severity: 'critical' })
    const result = await deliverMarketingAlerts([crit, stored('b'), stored('c', { severity: 'critical', immediateNotifiedAt: iso(2) }), stored('d', { severity: 'critical', firstDetectedAt: iso(48) })], ctx(config(), 14), d)
    expect(result.immediate).toEqual({ eligible: 1, slack: 'sent', inApp: 'sent' })
    expect(d.postSlack).toHaveBeenCalledTimes(1)
    const [url, blocks] = d.postSlack.mock.calls[0]!
    expect(url).toBe('https://hooks.slack.com/services/T/B/x')
    const text = JSON.stringify(blocks)
    expect(text).toContain('1 new critical marketing alert')
    expect(text).toContain('&lt;a&gt; &amp; co') // Slack control characters escaped
    expect(text).toContain('https://app.example/agency/social/spend')
    expect(text).toContain('Notify-only')
    expect(d.notify).toHaveBeenCalledWith('user-1', expect.objectContaining({ link: '/agency/social/spend', metadata: { kind: 'marketing_alert_immediate', alertIds: [crit.id] } }))
    expect(d.markImmediateNotified).toHaveBeenCalledWith([crit.id])
    expect(d.digestAlreadyHandled).not.toHaveBeenCalled()
  })

  it('re-sends a critical immediately after it escalates from warning', async () => {
    const d = deps()
    await deliverMarketingAlerts([stored('a', { severity: 'critical', firstDetectedAt: iso(72), severityChangedAt: iso(1) })], ctx(config(), 14), d)
    expect(d.postSlack).toHaveBeenCalledTimes(1)
  })

  it('posts one daily digest at the digest hour listing only new/escalated alerts plus an ongoing count', async () => {
    const d = deps()
    const fresh = stored('n')
    const ongoing = stored('o', { lastDigestAt: iso(24) })
    const escalated = stored('e', { severity: 'critical', lastDigestAt: iso(24), severityChangedAt: iso(3), immediateNotifiedAt: iso(3) })
    const info = stored('i', { severity: 'info' })
    const result = await deliverMarketingAlerts([escalated, fresh, ongoing, info], ctx(config(), 9), d)
    expect(result.digest).toMatchObject({ due: true, slack: 'sent', inApp: 'sent' })
    const text = JSON.stringify(d.postSlack.mock.calls.at(-1)![1])
    expect(text).toContain('3 new · 1 ongoing')
    expect(text).toContain('Summary &lt;n&gt;')
    expect(text).toContain('Summary &lt;e&gt;')
    expect(text).not.toContain('Summary &lt;o&gt;') // ongoing condition not re-alerted
    expect(text).not.toContain('Summary &lt;i&gt;') // info is counted, not listed
    expect(d.markDigested).toHaveBeenCalledWith([escalated.id, fresh.id, info.id])
  })

  it('does not post a second digest the same day', async () => {
    const d = deps({ digestAlreadyHandled: vi.fn(async () => true) })
    const result = await deliverMarketingAlerts([stored('n')], ctx(config(), 9), d)
    expect(result.digest).toMatchObject({ slack: 'already_handled', inApp: 'already_handled' })
    expect(d.postSlack).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('sends nothing on any channel while staff notifications are paused, records the suppression and leaves alerts un-notified', async () => {
    const d = deps({ isPaused: vi.fn(() => true) })
    const result = await deliverMarketingAlerts([stored('a', { severity: 'critical' }), stored('b')], ctx(config(), 9), d)
    expect(result.immediate).toMatchObject({ slack: 'suppressed_paused', inApp: 'suppressed_paused' })
    expect(result.digest).toMatchObject({ slack: 'suppressed_paused', inApp: 'suppressed_paused' })
    expect(d.postSlack).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
    expect(d.resolveRecipientIds).not.toHaveBeenCalled()
    expect(d.markImmediateNotified).not.toHaveBeenCalled()
    expect(d.markDigested).not.toHaveBeenCalled()
    expect(d.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 'suppressed_paused', detail: 'USER_MEMBER_NOTIFICATIONS_DISABLED' }))
  })

  it('needs an explicit target: no webhook and no recipients means nothing is sent', async () => {
    const d = deps({ resolveRecipientIds: vi.fn(async () => []) })
    const cfg = config({ slack: { webhookUrl: null, channel: null, useBudgetSlackWebhook: false } })
    const result = await deliverMarketingAlerts([stored('a', { severity: 'critical' })], ctx(cfg, 14), d)
    expect(result.immediate).toMatchObject({ slack: 'skipped_no_target', inApp: 'skipped_no_target' })
    expect(d.loadBudgetSlackWebhook).not.toHaveBeenCalled()
    expect(d.postSlack).not.toHaveBeenCalled()
    expect(d.markImmediateNotified).not.toHaveBeenCalled()
  })

  it('can reuse the Budget Review webhook when configured to', async () => {
    const d = deps({ loadBudgetSlackWebhook: vi.fn(async () => ({ webhookUrl: 'https://hooks.slack.com/services/budget', channel: '#budgets' })) })
    const cfg = config({ slack: { webhookUrl: null, channel: '#marketing-alerts', useBudgetSlackWebhook: true }, delivery: { slack: true, inApp: false } })
    await deliverMarketingAlerts([stored('a', { severity: 'critical' })], ctx(cfg, 14), d)
    expect(d.postSlack).toHaveBeenCalledWith('https://hooks.slack.com/services/budget', expect.any(Array), '#marketing-alerts')
  })

  it('a failed Slack post is recorded and the alert stays eligible for retry', async () => {
    const d = deps({ postSlack: vi.fn(async () => ({ ok: false, error: 'http_500' })) })
    await deliverMarketingAlerts([stored('a', { severity: 'critical' })], ctx(config({ delivery: { slack: true, inApp: false } }), 14), d)
    expect(d.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ channel: 'slack', status: 'failed' }))
    expect(d.markImmediateNotified).not.toHaveBeenCalled()
  })
})
