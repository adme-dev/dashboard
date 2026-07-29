import { beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../../workers/leads-cron/src/index'

describe('leads cron email recovery fan-out', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('calls stuck-claim and email recovery independently on the existing five-minute tick', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/recover-stuck-claims')) throw new Error('first route unavailable')
      return new Response(JSON.stringify({ raw: 'must not be logged' }), { status: 200 })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    try {
      await worker.scheduled(
        { cron: '*/5 * * * *' } as ScheduledController,
        {
          APP_BASE_URL: 'https://app.example.test',
          INTERNAL_CRON_TOKEN: 'cron-secret'
        },
        {} as ExecutionContext
      )
    } finally {
      vi.unstubAllGlobals()
    }

    expect(calls).toEqual([
      'https://app.example.test/api/leads/_internal/recover-stuck-claims',
      'https://app.example.test/api/leads/_internal/recover-email-ingestions'
    ])
    expect(log.mock.calls.flat().join(' ')).not.toContain('must not be logged')
    expect(error).toHaveBeenCalled()
  })
})
