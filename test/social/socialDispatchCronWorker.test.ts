import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../../workers/social-dispatch-cron/src/index'

const env = { APP_BASE_URL: 'https://example.test', CRON_SECRET: 'secret' }
const run = () => worker.scheduled({} as never, env, {} as never)
afterEach(() => vi.unstubAllGlobals())
describe('social dispatch cron worker', () => {
  it('runs dispatch and news replenishment with the configured secret', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    await run()
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://example.test/api/cron/publish-social-posts',
      'https://example.test/api/cron/replenish-social-news'
    ])
    for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ method: 'POST', headers: { 'x-cron-secret': 'secret' } })
  })
  it.each(['http', 'network'])('reports %s failure after both jobs have been attempted', async (failure) => {
    const fetcher = vi.fn()
    if (failure === 'http') fetcher.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    else fetcher.mockRejectedValueOnce(new Error('unreachable'))
    fetcher.mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    await expect(run()).rejects.toThrow('Social cron job failed: publish-social-posts')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
