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

  it('declares the daily trigger with the Knox pilot explicit in production config', () => {
    const cronConfig = parse(
      readFileSync('workers/pages-cron/wrangler.toml', 'utf8')
    ) as { triggers?: { crons?: string[] } }
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as {
      vars?: Record<string, string>
      env?: { production?: { vars?: Record<string, string> } }
    }
    const productionVars = pagesConfig.env?.production?.vars

    expect(cronConfig.triggers?.crons).toContain('15 2 * * *')
    expect(pagesConfig.vars?.SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(pagesConfig.vars?.NUXT_SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(pagesConfig.vars?.NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(productionVars?.SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(productionVars?.NUXT_SEARCH_AUTHORITY_ENABLED).toBe('true')
    expect(productionVars?.NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED).toBe('true')
  })

  it('dispatches the optional Google Business performance refresh on its own offset', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      text: async () => '{"ok":true,"enabled":false,"queued":false}'
    }))
    vi.stubGlobal('fetch', fetchMock)

    await worker.scheduled(
      { cron: '40 2 * * *' } as ScheduledController,
      { APP_BASE_URL: 'https://app.example.com', CRON_SECRET: 'secret' },
      {} as ExecutionContext
    )

    expect(ROUTES['40 2 * * *']).toEqual(['/api/cron/google-business-performance'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/cron/google-business-performance',
      {
        method: 'POST',
        headers: { 'x-cron-secret': 'secret' }
      }
    )
  })
})
