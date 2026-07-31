import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it, vi } from 'vitest'
import worker, { ROUTES } from '../../workers/pages-cron/src/index'

describe('Search Authority cron worker registration', () => {
  it('dispatches the dedicated daily schedule to the Search Console route', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      text: async () => '{"ok":true}'
    }))
    vi.stubGlobal('fetch', fetchMock)

    await worker.scheduled(
      { cron: '15 2 * * *' } as ScheduledController,
      { APP_BASE_URL: 'https://app.example.com', CRON_SECRET: 'secret' },
      {} as ExecutionContext
    )

    expect(ROUTES['15 2 * * *']).toEqual(['/api/cron/search-console-sync'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/cron/search-console-sync',
      {
        method: 'POST',
        headers: { 'x-cron-secret': 'secret' }
      }
    )
  })

  it('declares the daily trigger with the Knox production pilot globally armed', () => {
    const cronConfig = parse(
      readFileSync('workers/pages-cron/wrangler.toml', 'utf8')
    ) as { triggers?: { crons?: string[] } }
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as {
      vars?: Record<string, string>
    }
    const productionWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')

    expect(cronConfig.triggers?.crons).toContain('15 2 * * *')
    expect(pagesConfig.vars?.SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(productionWorkflow).toContain('SEARCH_AUTHORITY_ENABLED: \'true\'')
  })
})
