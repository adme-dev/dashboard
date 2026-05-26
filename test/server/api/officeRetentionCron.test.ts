import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRunOfficeRetentionCleanup = vi.fn()

vi.mock('~~/server/utils/officeRetention', () => ({
  runOfficeRetentionCleanup: (...args: unknown[]) => mockRunOfficeRetentionCleanup(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/cron/office-retention.post'
)

function fakeEvent(secret = 'secret') {
  return {
    headers: { 'x-cron-secret': secret }
  } satisfies TestEvent
}

describe('POST /api/cron/office-retention', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret')
    mockRunOfficeRetentionCleanup.mockReset()
    mockRunOfficeRetentionCleanup.mockResolvedValue({
      archivedRecordings: 3,
      deletedRecordingAssets: 2,
      failedRecordingAssetDeletes: 1,
      deletedMeetingSessions: 2,
      expiredLobbyRequests: 4,
      expiredGuestBadges: 5
    })
  })

  it('runs office retention cleanup', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({
      ok: true,
      archivedRecordings: 3,
      deletedRecordingAssets: 2,
      failedRecordingAssetDeletes: 1,
      deletedMeetingSessions: 2,
      expiredLobbyRequests: 4,
      expiredGuestBadges: 5
    })
    expect(mockRunOfficeRetentionCleanup).toHaveBeenCalledOnce()
  })
})
