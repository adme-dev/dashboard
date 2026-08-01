import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  context?: Record<string, unknown>
}

const mockClaimDueDomains = vi.fn()
const mockStartCrawl = vi.fn()

vi.mock('~~/server/utils/siteIntelligence/scheduler', () => ({
  claimDueSiteIntelligenceDomains: (...args: unknown[]) => mockClaimDueDomains(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/crawlRunner', () => ({
  startGovernedSiteIntelligenceCrawl: (...args: unknown[]) => mockStartCrawl(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()],
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const { default: handler } = await import('../../../server/api/cron/site-intelligence.post')
const cron = handler as (event: TestEvent) => Promise<Record<string, unknown>>

const oldEnv = { ...process.env }

describe('site intelligence scheduler cron', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      CRON_SECRET: 'cron-secret',
      SITE_INTELLIGENCE_ENABLED: 'true'
    }
    vi.clearAllMocks()
    mockClaimDueDomains.mockResolvedValue([
      { domainId: 'domain-1', clientId: 'client-1', nextRunAt: '2026-08-02T00:00:00.000Z' },
      { domainId: 'domain-2', clientId: 'client-2', nextRunAt: '2026-08-08T00:00:00.000Z' }
    ])
    mockStartCrawl
      .mockResolvedValueOnce({ status: 'started', run: { id: 'run-1' } })
      .mockResolvedValueOnce({ status: 'active_run', run: null })
  })

  it('authenticates, caps claims at 20, and records each domain result independently', async () => {
    const event = { headers: { 'x-cron-secret': 'cron-secret' }, context: {} }
    const response = await cron(event)

    expect(mockClaimDueDomains).toHaveBeenCalledWith(20, expect.any(Date))
    expect(mockStartCrawl).toHaveBeenCalledTimes(2)
    expect(mockStartCrawl).toHaveBeenNthCalledWith(1, event, { id: null }, 'domain-1', 'schedule')
    expect(response).toEqual({
      ok: true,
      claimed: 2,
      started: 1,
      skipped: 1,
      failed: 0,
      results: [
        { domainId: 'domain-1', status: 'started', runId: 'run-1' },
        { domainId: 'domain-2', status: 'active_run' }
      ]
    })
  })

  it('rejects a missing secret and stays dormant behind the feature flag', async () => {
    await expect(cron({ headers: {}, context: {} })).rejects.toMatchObject({ statusCode: 401 })
    process.env.SITE_INTELLIGENCE_ENABLED = 'false'
    await expect(cron({ headers: { 'x-cron-secret': 'cron-secret' }, context: {} }))
      .rejects.toMatchObject({ statusCode: 503 })
    expect(mockClaimDueDomains).not.toHaveBeenCalled()
  })

  it('continues after one workflow start throws and reports a bounded safe failure', async () => {
    mockStartCrawl
      .mockReset()
      .mockRejectedValueOnce(new Error('workflow token super-secret'))
      .mockResolvedValueOnce({ status: 'started', run: { id: 'run-2' } })

    const response = await cron({ headers: { 'x-cron-secret': 'cron-secret' }, context: {} })

    expect(response).toMatchObject({ claimed: 2, started: 1, failed: 1 })
    expect(JSON.stringify(response)).not.toContain('super-secret')
  })

  it('claims only active due scheduled domains with lock skipping and deterministic advancement', () => {
    const scheduler = readFileSync('server/utils/siteIntelligence/scheduler.ts', 'utf8')

    expect(scheduler).toContain('d.status = \'active\'')
    expect(scheduler).toContain('d.frequency IN (\'daily\', \'weekly\')')
    expect(scheduler).toContain('r.status IN (\'queued\', \'running\')')
    expect(scheduler).toContain('FOR UPDATE OF d SKIP LOCKED')
    expect(scheduler).toContain('LIMIT $1')
    expect(scheduler).toContain('INTERVAL \'1 day\'')
    expect(scheduler).toContain('INTERVAL \'7 days\'')
  })
})
