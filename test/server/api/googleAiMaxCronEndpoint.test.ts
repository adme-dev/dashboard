import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRunScheduled = vi.fn()
const mockRunAfterResponse = vi.fn()
const mockEnqueue = vi.fn()

vi.mock('~~/server/utils/googleAiMaxScheduler', () => ({
  runGoogleAiMaxScheduledScans: (...args: any[]) => mockRunScheduled(...args),
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: (...args: any[]) => mockRunAfterResponse(...args),
}))
vi.mock('~~/server/utils/googleAiMaxCache', () => ({
  captureGoogleAiMaxCacheInvalidator: () => vi.fn().mockResolvedValue(0),
}))
vi.mock('~~/server/utils/queue', () => ({
  enqueue: (...args: any[]) => mockEnqueue(...args),
}))

;(globalThis as any).eventHandler = (handler: any) => handler
;(globalThis as any).getHeader = (event: any, name: string) => event.headers?.[name]
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage), input)

const { default: handler } = await import(
  '../../../../server/api/cron/google-ai-max-readiness.post'
)

describe('POST /api/cron/google-ai-max-readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'configured-secret'
    mockRunScheduled.mockResolvedValue({ tenantCount: 1, started: 1, skipped: 0, failed: 0, results: [] })
    mockEnqueue.mockResolvedValue(true)
  })

  it.each([undefined, '', 'wrong'])('rejects a missing or invalid cron secret', async (secret) => {
    await expect(handler({ headers: { 'x-cron-secret': secret } } as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('enqueues the readiness scan as a durable queue job and responds immediately', async () => {
    const event = { headers: { 'x-cron-secret': 'configured-secret' } } as any
    const response = await handler(event)

    expect(response).toMatchObject({ ok: true, scheduled: true })
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    const [enqueuedEvent, jobType, payload, fallback] = mockEnqueue.mock.calls[0]
    expect(enqueuedEvent).toBe(event)
    expect(jobType).toBe('google.aimax.readiness')
    expect(payload).toMatchObject({ observedAt: expect.any(String) })
    expect(typeof fallback).toBe('function')

    // Exercise the local-dev fallback path the same way queue.ts does when no JOBS_QUEUE
    // binding is present, to prove it still reproduces the previous runAfterResponse behavior.
    expect(mockRunScheduled).not.toHaveBeenCalled()
    await fallback()
    expect(mockRunAfterResponse).toHaveBeenCalledWith(
      event,
      expect.any(Promise),
      'google-ai-max-readiness-cron',
    )
  })
})
