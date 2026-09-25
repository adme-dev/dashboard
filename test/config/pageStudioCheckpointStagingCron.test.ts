import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { afterEach, expect, it, vi } from 'vitest'
import worker, { ROUTES } from '../../workers/pages-cron/src/index'

afterEach(() => vi.unstubAllGlobals())
it('dispatches checkpoint staging once on the existing five-minute schedule', async () => {
  const endpoint = '/api/cron/page-studio-checkpoint-staging'
  const config = parse(readFileSync('workers/pages-cron/wrangler.toml', 'utf8')) as { triggers: { crons: string[] } }
  expect(config.triggers.crons).toContain('*/5 * * * *')
  expect(ROUTES['*/5 * * * *']?.filter(route => route === endpoint)).toEqual([endpoint])
  expect(Object.values(ROUTES).flat().filter(route => route === endpoint)).toHaveLength(1)
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"ok":true,"claimed":0}'))
  vi.stubGlobal('fetch', fetch)
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController,
    { APP_BASE_URL: 'https://app.example.com', CRON_SECRET: 'cron-secret' }, {} as ExecutionContext)
  expect(fetch.mock.calls.filter(([url]) => url === `https://app.example.com${endpoint}`)).toEqual([
    [`https://app.example.com${endpoint}`, { method: 'POST', headers: { 'x-cron-secret': 'cron-secret' } }]
  ])
})
