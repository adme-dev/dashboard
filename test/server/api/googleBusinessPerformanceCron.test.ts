import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: false,
  secret: 'cron-secret',
  header: 'cron-secret',
  runAfterResponse: vi.fn(),
  sync: vi.fn(async () => ({ eligibleAccounts: 1, syncedAccounts: 1, failedAccounts: 0, rowsUpserted: 8 }))
}))

vi.mock('h3', () => ({
  getHeader: () => mocks.header
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: mocks.runAfterResponse
}))
vi.mock('~~/server/utils/social-providers/google-business-performance', () => ({
  isGoogleBusinessPerformanceEnabled: () => mocks.enabled,
  syncGoogleBusinessPerformance: mocks.sync
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input))

describe('Google Business Profile performance cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enabled = false
    mocks.header = 'cron-secret'
    process.env.CRON_SECRET = 'cron-secret'
  })

  it('no-ops safely while provider performance access is disabled', async () => {
    const handler = (await import(
      '~~/server/api/cron/google-business-performance.post'
    )).default

    const result = await handler({} as never)

    expect(result).toEqual({ ok: true, enabled: false, queued: false })
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.runAfterResponse).not.toHaveBeenCalled()
  })

  it('queues a bounded background sync when explicitly enabled', async () => {
    mocks.enabled = true
    const handler = (await import(
      '~~/server/api/cron/google-business-performance.post'
    )).default

    const result = await handler({} as never)

    expect(result).toEqual({ ok: true, enabled: true, queued: true })
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ event: expect.anything() }))
    expect(mocks.runAfterResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Promise),
      'google-business-performance-sync'
    )
  })

  it('rejects unauthenticated production calls', async () => {
    mocks.header = 'wrong'
    const handler = (await import(
      '~~/server/api/cron/google-business-performance.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 401 })
  })
})
