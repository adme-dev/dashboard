import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRunScheduled = vi.fn()
const mockRunAfterResponse = vi.fn()

vi.mock('~~/server/utils/googleAiMaxScheduler', () => ({
  runGoogleAiMaxScheduledScans: (...args: any[]) => mockRunScheduled(...args),
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: (...args: any[]) => mockRunAfterResponse(...args),
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
  })

  it.each([undefined, '', 'wrong'])('rejects a missing or invalid cron secret', async (secret) => {
    await expect(handler({ headers: { 'x-cron-secret': secret } } as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockRunScheduled).not.toHaveBeenCalled()
  })

  it('registers tenant scans as background work without using session state', async () => {
    const event = { headers: { 'x-cron-secret': 'configured-secret' } } as any
    const response = await handler(event)

    expect(response).toMatchObject({ ok: true, scheduled: true })
    expect(mockRunScheduled).toHaveBeenCalledTimes(1)
    expect(mockRunAfterResponse).toHaveBeenCalledWith(
      event,
      expect.any(Promise),
      'google-ai-max-readiness-cron',
    )
  })
})
