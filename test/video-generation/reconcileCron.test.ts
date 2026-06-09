import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getHeader = (e: any, n: string) => e.headers?.[n]
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)

const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryRows: (...a: unknown[]) => mockQueryRows(...a) }))

const mockMarkFailed = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  mapVideoGenerationJobRow: (row: any) => row,
  markVideoGenerationJobFailed: (...a: unknown[]) => mockMarkFailed(...a),
}))

const mockMakeProvider = vi.fn(() => ({ submit: vi.fn(), poll: vi.fn() }))
vi.mock('~~/server/utils/video-generation/providers/aiGatewayProvider', () => ({
  makeAiGatewayProvider: (...a: unknown[]) => mockMakeProvider(...a),
}))

const mockReconcile = vi.fn()
vi.mock('~~/server/utils/video-generation/reconcile', () => ({
  reconcileRunningJob: (...a: unknown[]) => mockReconcile(...a),
}))

vi.mock('~~/server/utils/video-generation/finalize', () => ({ finalizeVideoGenerationJob: vi.fn() }))

const { default: handler } = await import('../../server/api/cron/video-generation-reconcile.post')

function ev(withAi: boolean) {
  return {
    headers: { 'x-cron-secret': 'secret' },
    context: withAi ? { cloudflare: { env: { AI: { run: vi.fn() } } } } : {},
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMarkFailed.mockResolvedValue(undefined)
  process.env.CRON_SECRET = 'secret'
  process.env.VIDEO_STUDIO_ENABLED = 'true'
  process.env.VIDEO_GENERATION_ENABLED = 'true'
})
afterEach(() => {
  delete process.env.VIDEO_STUDIO_ENABLED
  delete process.env.VIDEO_GENERATION_ENABLED
})

describe('POST /cron/video-generation-reconcile', () => {
  it('rejects a bad cron secret', async () => {
    await expect(handler({ headers: { 'x-cron-secret': 'nope' }, context: {} } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('no-ops when the feature flags are off', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED
    const res = await handler(ev(true))
    expect(res).toEqual({ ran: false, reason: 'disabled' })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('reaps stale jobs and polls in-flight aigateway jobs, tallying outcomes', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'stale-1' }]) // stale reap query
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) // in-flight poll query
    mockReconcile
      .mockResolvedValueOnce('succeeded')
      .mockResolvedValueOnce('running')
      .mockResolvedValueOnce('failed')

    const res = await handler(ev(true))

    expect(mockMarkFailed).toHaveBeenCalledWith('stale-1', expect.stringMatching(/timed out/))
    expect(mockMakeProvider).toHaveBeenCalled()
    expect(mockReconcile).toHaveBeenCalledTimes(3)
    expect(res).toMatchObject({ ran: true, reaped: 1, polled: 3, succeeded: 1, running: 1, failed: 1, aiBinding: true })
  })

  it('still reaps but skips polling when the AI binding is absent', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'stale-1' }])

    const res = await handler(ev(false))

    expect(mockQueryRows).toHaveBeenCalledTimes(1) // only the reap query, no in-flight poll query
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(res).toMatchObject({ ran: true, reaped: 1, polled: 0, aiBinding: false })
  })
})
