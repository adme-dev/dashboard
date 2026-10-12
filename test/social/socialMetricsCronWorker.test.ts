import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../../workers/social-metrics-cron/src/index'

const env = { APP_BASE_URL: 'https://example.test', CRON_SECRET: 'secret' }
const run = () => worker.scheduled({} as ScheduledController, env, {} as ExecutionContext)
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('social metrics cron worker', () => {
  it('rejects HTTP failures without logging the raw response', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private response', { status: 401 })))
    await expect(run()).rejects.toThrow(/HTTP 401/)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private response')
  })

  it('rejects critical collector health even when HTTP succeeds', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, health: { status: 'critical' } })))
    await expect(run()).rejects.toThrow(/critical/)
  })

  it('accepts healthy collection and bounds request time', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => Response.json({ ok: true, health: { status: 'healthy' }, accountsSynced: 1, postsSynced: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(run()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', signal: expect.any(AbortSignal) })
  })
})
