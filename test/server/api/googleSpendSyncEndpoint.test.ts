import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockCreateSpendSyncJob = vi.fn()
const mockSetSyncJobTotalAccounts = vi.fn()
const mockCompleteSpendSyncJob = vi.fn()
const mockFailSpendSyncJob = vi.fn()
const mockListGoogleConnectionIds = vi.fn()
const mockSyncGoogleSpend = vi.fn()
const mockRunSpendSyncInBackground = vi.fn()
const mockQueueSend = vi.fn()
let mockBody: Record<string, unknown> | null = null
let mockQueue: { send: typeof mockQueueSend } | null = { send: mockQueueSend }

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/spendSyncJobs', () => ({
  createSpendSyncJob: (...args: unknown[]) => mockCreateSpendSyncJob(...args),
  setSyncJobTotalAccounts: (...args: unknown[]) => mockSetSyncJobTotalAccounts(...args),
  completeSpendSyncJob: (...args: unknown[]) => mockCompleteSpendSyncJob(...args),
  failSpendSyncJob: (...args: unknown[]) => mockFailSpendSyncJob(...args),
  reapOrphanedSpendSyncJobs: async () => []
}))

vi.mock('~~/server/utils/spendSync', () => ({
  listGoogleConnectionIds: (...args: unknown[]) => mockListGoogleConnectionIds(...args),
  syncGoogleSpend: (...args: unknown[]) => mockSyncGoogleSpend(...args),
  listMetaConnectionIds: vi.fn(), syncMetaSpend: vi.fn(), syncMicrosoftSpend: vi.fn(),
  syncPinterestSpend: vi.fn(), syncTikTokSpend: vi.fn(), syncLinkedinSpend: vi.fn(),
  syncSnapchatSpend: vi.fn(), syncTwitterSpend: vi.fn()
}))

vi.mock('~~/server/utils/asyncBackground', () => ({
  runSpendSyncInBackground: (...args: unknown[]) => mockRunSpendSyncInBackground(...args)
}))

vi.mock('~~/server/utils/queue', () => ({
  getQueue: () => mockQueue
}))

;(globalThis as typeof globalThis & { eventHandler: <T>(fn: T) => T }).eventHandler = fn => fn
;(globalThis as typeof globalThis & { readBody: () => Promise<Record<string, unknown> | null> }).readBody = async () => mockBody

describe('POST /api/agency/social/google/sync-spend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = { month: 6, year: 2026 }
    mockQueue = { send: mockQueueSend }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockCreateSpendSyncJob.mockResolvedValue('job-1')
    mockListGoogleConnectionIds.mockResolvedValue(['g1', 'g2', 'g3'])
    mockQueueSend.mockResolvedValue(undefined)
    mockRunSpendSyncInBackground.mockReturnValue({ status: 'started', startedAt: 'fallback', jobId: 'job-1' })
  })

  it('fans out Google sync by account when the queue is available', async () => {
    const handler = (await import('~~/server/api/agency/social/google/sync-spend.post')).default

    const result = await handler({} as never)

    expect(mockCreateSpendSyncJob).toHaveBeenCalledWith('google', '2026-06', 'user-1')
    expect(mockSetSyncJobTotalAccounts).toHaveBeenCalledWith('job-1', 3)
    expect(mockQueueSend).toHaveBeenCalledTimes(3)
    expect(mockQueueSend.mock.calls.map(call => call[0].payload.connectionId)).toEqual(['g1', 'g2', 'g3'])
    expect(mockQueueSend.mock.calls.every(call => call[0].type === 'spend.sync.google.account')).toBe(true)
    expect(mockRunSpendSyncInBackground).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'started',
      jobId: 'job-1',
      queued: true,
      accounts: 3
    })
  })

  it('falls back to waitUntil when no queue is available', async () => {
    mockQueue = null
    const handler = (await import('~~/server/api/agency/social/google/sync-spend.post')).default

    const result = await handler({} as never)

    expect(mockQueueSend).not.toHaveBeenCalled()
    expect(mockRunSpendSyncInBackground).toHaveBeenCalledOnce()
    // The inline path is declared, not hidden: queued:false tells the caller no fan-out happened.
    expect(result).toMatchObject({ status: 'started', jobId: 'job-1', queued: false, accounts: 0, reapedJobIds: [] })
  })
})
