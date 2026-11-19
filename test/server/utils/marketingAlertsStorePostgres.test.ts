// Exercises migration 517 and the real store SQL against a throwaway local PostgreSQL database.
// Skipped unless MARKETING_ALERTS_PG_URL points at localhost/127.0.0.1 and a database named
// marketing_alerts_test* (never a shared or production database).
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DetectedMarketingAlert } from '~~/server/utils/marketingAlerts/types'

const url = process.env.MARKETING_ALERTS_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/marketing_alerts_test[a-z0-9_]*$/.test(target.pathname)

const h = vi.hoisted(() => ({ client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number | null }> } }))
vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params)).rows,
  queryRows: async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params)).rows,
  execute: async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params)).rowCount ?? 0
}))

const alert = (key: string, severity: DetectedMarketingAlert['severity'] = 'warning'): DetectedMarketingAlert => ({
  dedupeKey: key,
  source: 'budget_pacing',
  kind: 'over_pacing',
  severity,
  clientId: '11111111-1111-4111-8111-111111111111',
  clientName: 'Client',
  platform: 'google_ads',
  accountRef: '123',
  campaignRef: 'c1',
  summary: 'summary',
  nextStep: 'Ask Claude',
  mcpTool: 'get_budget_health',
  deepLink: '/agency/budget-health',
  evidence: { a: 1 }
})

describe.skipIf(!allowed)('marketing alerts store against PostgreSQL', () => {
  let db: pg.Client
  beforeAll(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    h.client = db
    await db.query('DROP TABLE IF EXISTS marketing_alerts, marketing_alert_deliveries')
    const migration = readFileSync('server/database/migrations/517_marketing_alerts.sql', 'utf8')
    await db.query(migration)
    await db.query(migration) // idempotent
  })
  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS marketing_alerts, marketing_alert_deliveries')
    await db.end()
  })

  it('upserts on the open dedupe key, keeps the id stable, tracks escalation and resolves cleared conditions', async () => {
    const store = await import('~~/server/utils/marketingAlerts/store')
    expect(await store.upsertMarketingAlerts('t', [alert('a'), alert('b')])).toEqual({ opened: 2, refreshed: 0 })
    const [first] = (await store.listOpenMarketingAlerts('t')).filter(a => a.dedupeKey === 'a')
    expect(first!.severityChangedAt).toBeNull()

    expect(await store.upsertMarketingAlerts('t', [alert('a', 'critical'), alert('b')])).toEqual({ opened: 0, refreshed: 2 })
    const [again] = (await store.listOpenMarketingAlerts('t')).filter(a => a.dedupeKey === 'a')
    expect(again!.id).toBe(first!.id)
    expect(again!.severity).toBe('critical')
    expect(again!.severityChangedAt).not.toBeNull()

    expect(await store.resolveClearedMarketingAlerts('t', ['budget_pacing'], ['a'])).toBe(1)
    expect((await store.listOpenMarketingAlerts('t')).map(a => a.dedupeKey)).toEqual(['a'])
    // A source that was not evaluated (e.g. its query failed) keeps its alerts.
    expect(await store.resolveClearedMarketingAlerts('t', ['anomaly'], [])).toBe(0)

    // A recurrence after resolution is a new alert with a new id.
    await store.upsertMarketingAlerts('t', [alert('b')])
    const recurred = (await store.listOpenMarketingAlerts('t')).find(a => a.dedupeKey === 'b')!
    const old = await db.query(`SELECT id::text FROM marketing_alerts WHERE dedupe_key = 'b' AND status = 'resolved'`)
    expect(recurred.id).not.toBe(old.rows[0].id)

    await store.markImmediateNotified([again!.id])
    await store.markDigested([again!.id])
    const marked = (await store.listOpenMarketingAlerts('t')).find(a => a.id === again!.id)!
    expect(marked.immediateNotifiedAt).not.toBeNull()
    expect(marked.lastDigestAt).not.toBeNull()
  })

  it('records deliveries and treats a handled digest as once per local date per channel', async () => {
    const store = await import('~~/server/utils/marketingAlerts/store')
    expect(await store.digestAlreadyHandled('t', '2026-11-19', 'slack')).toBe(false)
    await store.recordDelivery({ tenantId: 't', kind: 'digest', channel: 'slack', status: 'failed', alertIds: [], localDate: '2026-11-19' })
    expect(await store.digestAlreadyHandled('t', '2026-11-19', 'slack')).toBe(false)
    await store.recordDelivery({ tenantId: 't', kind: 'digest', channel: 'slack', status: 'suppressed_paused', alertIds: [], localDate: '2026-11-19' })
    expect(await store.digestAlreadyHandled('t', '2026-11-19', 'slack')).toBe(true)
    expect(await store.digestAlreadyHandled('t', '2026-11-19', 'in_app')).toBe(false)
    expect(await store.digestAlreadyHandled('t', '2026-11-20', 'slack')).toBe(false)
  })
})
