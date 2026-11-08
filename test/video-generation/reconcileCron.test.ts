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
  failUnclaimedVideoGenerationDispatch: (...a: unknown[]) => mockMarkFailed(...a),
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

import {
  INFLIGHT_VIDEO_GENERATION_POLL_SQL,
  RETAINED_VIDEO_GENERATION_RUNNING_SQL,
  UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL,
} from '~~/shared/video/generationLiability'

const { default: handler } = await import('../../server/api/cron/video-generation-reconcile.post')

function ev(withAi: boolean) {
  return {
    headers: { 'x-cron-secret': 'secret' },
    context: withAi ? { cloudflare: { env: { CRON_SECRET: 'secret', VIDEO_GENERATION_ENABLED: process.env.VIDEO_GENERATION_ENABLED, AI: { run: vi.fn() } } } } : {},
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockQueryRows.mockReset()
  mockReconcile.mockReset()
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

  it('fails closed when both the configured and supplied secrets are missing', async () => {
    delete process.env.CRON_SECRET
    await expect(handler({ headers: {}, context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('honors deployed false over a locally enabled process environment', async () => {
    const event = ev(true)
    event.context.cloudflare.env.VIDEO_GENERATION_ENABLED = 'false'
    expect(await handler(event)).toEqual({ ran: false, reason: 'disabled' })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('no-ops when the feature flags are off', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED
    const res = await handler(ev(true))
    expect(res).toEqual({ ran: false, reason: 'disabled' })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('releases only unsubmitted dispatch-eligible jobs and keeps running liability', async () => {
    mockMarkFailed.mockResolvedValue({ id: 'dispatch-stale-1', status: 'failed' })
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'dispatch-stale-1' }])
      .mockResolvedValueOnce([{ id: 'stale-1' }])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    mockReconcile
      .mockResolvedValueOnce('succeeded')
      .mockResolvedValueOnce('running')
      .mockResolvedValueOnce('failed')

    const res = await handler(ev(true))

    expect(mockQueryRows).toHaveBeenNthCalledWith(1, UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL)
    expect(mockQueryRows).toHaveBeenNthCalledWith(2, RETAINED_VIDEO_GENERATION_RUNNING_SQL)
    expect(mockQueryRows).toHaveBeenNthCalledWith(3, INFLIGHT_VIDEO_GENERATION_POLL_SQL)
    expect(UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL).toContain('submission_attempted_at IS NULL')
    expect(UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL).toContain('dispatch_eligible = true')
    expect(UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL).toContain('provider_request_id IS NULL')
    expect(mockMarkFailed).toHaveBeenCalledTimes(1)
    expect(mockMarkFailed).toHaveBeenCalledWith('dispatch-stale-1', expect.stringMatching(/Dispatch timeout/))
    expect(mockMarkFailed).not.toHaveBeenCalledWith('stale-1', expect.anything())
    expect(mockMakeProvider).toHaveBeenCalled()
    expect(mockReconcile).toHaveBeenCalledTimes(3)
    expect(res).toMatchObject({
      ran: true,
      dispatchTimedOut: 1,
      retainedRunning: 1,
      reaped: 0,
      polled: 3,
      succeeded: 1,
      running: 1,
      failed: 1,
      aiBinding: true,
    })
  })

  it('does not count a dispatch timeout when the claim wins the race', async () => {
    mockMarkFailed.mockResolvedValue({ id: 'dispatch-stale-1', status: 'queued', submissionAttemptedAt: '2026-06-09T00:00:01.000Z' })
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'dispatch-stale-1' }])
      .mockResolvedValueOnce([])

    const res = await handler(ev(false))

    expect(mockMarkFailed).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ ran: true, dispatchTimedOut: 0, retainedRunning: 0, reaped: 0, polled: 0 })
  })

  it('counts retained running jobs and skips polling when the AI binding is absent', async () => {
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'stale-1' }])

    const res = await handler(ev(false))

    expect(mockQueryRows).toHaveBeenCalledTimes(2)
    expect(mockMarkFailed).not.toHaveBeenCalled()
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(res).toMatchObject({ ran: true, dispatchTimedOut: 0, retainedRunning: 1, reaped: 0, polled: 0, aiBinding: false })
  })
})
