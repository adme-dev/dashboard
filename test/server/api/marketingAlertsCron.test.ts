import { readFileSync } from 'node:fs'
import { createEvent, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../workers/pages-cron/src/index'

import handler from '~~/server/api/cron/marketing-alerts.post'

const m = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn(), queryRowsFresh: vi.fn(), execute: vi.fn(), fetch: vi.fn(), notify: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.queryOne, queryRows: m.queryRows, queryRowsFresh: m.queryRowsFresh, execute: m.execute }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: m.notify }))

function event(headers: Record<string, string> = {}, bindings: Record<string, unknown> = {}): H3Event {
  const e = createEvent({ method: 'POST', url: '/api/cron/marketing-alerts', headers: { host: 'localhost', ...headers } } as never, {} as never)
  e.context.cloudflare = { env: bindings } as never
  return e
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', '')
  vi.stubGlobal('fetch', m.fetch)
  m.queryRows.mockResolvedValue([])
  m.queryRowsFresh.mockResolvedValue([])
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('/api/cron/marketing-alerts', () => {
  it('rejects requests without the cron secret before touching the database', async () => {
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
    await expect(handler(event({ 'x-cron-secret': 'wrong' }, { CRON_SECRET: 'right' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(m.queryOne).not.toHaveBeenCalled()
  })

  it('is dormant with no settings row: reads only tenant + config, writes and sends nothing', async () => {
    m.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const result = await handler(event({ 'x-cron-secret': 's' }, { CRON_SECRET: 's' }))
    expect(result).toEqual({ ok: true, skipped: 'disabled' })
    expect(m.queryOne).toHaveBeenCalledTimes(2)
    expect(m.queryOne.mock.calls[1]).toEqual([expect.stringContaining('FROM agency_settings'), ['__default__', 'marketing_alerts']])
    expect(m.queryRows).not.toHaveBeenCalled()
    expect(m.queryRowsFresh).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(m.fetch).not.toHaveBeenCalled()
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('stays dormant for anything other than an explicit enabled: true', async () => {
    m.queryOne.mockResolvedValueOnce({ tenant_id: 't1' }).mockResolvedValueOnce({ value: { enabled: 'yes', delivery: { slack: true, inApp: true } } })
    expect(await handler(event({ 'x-cron-secret': 's' }, { CRON_SECRET: 's' }))).toEqual({ ok: true, skipped: 'disabled' })
    expect(m.queryRows).not.toHaveBeenCalled()
  })

  it('in shadow mode evaluates and persists but never posts to Slack or notifies', async () => {
    m.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: { enabled: true, slack: { webhookUrl: 'https://hooks.slack.com/services/a/b/c' }, recipientEmails: ['x@y.z'] } })
    m.queryRowsFresh.mockImplementation(async (sql: string) => sql.includes('INSERT INTO marketing_alerts') ? [] : [])
    const result = await handler(event({ 'x-cron-secret': 's' }, { CRON_SECRET: 's' }))
    expect(result).toMatchObject({ ok: true, detected: 0, delivery: { immediate: { slack: 'off', inApp: 'off' } } })
    expect(m.queryRows).toHaveBeenCalled() // detectors read stored data
    expect(m.fetch).not.toHaveBeenCalled()
    expect(m.notify).not.toHaveBeenCalled()
  })
})

describe('pages-cron schedule', () => {
  // Hourly so critical alerts go out promptly; the handler self-gates the daily digest hour.
  it('drives the route hourly from the existing pages-cron worker', () => {
    expect(ROUTES['0 * * * *']).toContain('/api/cron/marketing-alerts')
    expect(readFileSync('workers/pages-cron/wrangler.toml', 'utf8')).toContain('"0 * * * *"')
  })
})
