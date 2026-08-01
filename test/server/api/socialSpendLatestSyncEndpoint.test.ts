import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
let mockQuery: Record<string, unknown> = { platform: 'google', period: '2026-08' }

vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mockQueryOne(...args) }))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/agency/social/spend/latest-sync', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockQuery = { platform: 'google', period: '2026-08' }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('returns the newest matching job with sanitized failures', async () => {
    mockQueryOne.mockResolvedValue({
      id: 'job-1',
      platform: 'google',
      period: '2026-08',
      status: 'completed',
      synced_count: 30,
      total_spend: '231.73',
      failures: [{ account: 'Account A', reason: 'access_token=provider-secret 403' }],
      error: null,
      started_at: '2026-08-01T03:19:22.000Z',
      finished_at: '2026-08-01T03:21:24.000Z',
      total_accounts: 108,
      processed_accounts: 108,
    })

    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    const result = await handler({} as any)

    expect(mockQueryOne.mock.calls[0][0]).toContain('ORDER BY started_at DESC')
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['google', '2026-08'])
    expect(result).toMatchObject({ jobId: 'job-1', syncedCount: 30, totalSpend: 231.73, totalAccounts: 108 })
    expect(JSON.stringify(result)).not.toContain('provider-secret')
  })

  it('returns null when the period has no sync job', async () => {
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    await expect(handler({} as any)).resolves.toBeNull()
  })

  it.each([
    [{ platform: 'unknown', period: '2026-08' }],
    [{ platform: 'google', period: '2026-13' }],
    [{ platform: 'google', period: 'August' }],
  ])('rejects invalid query input %#', async (query) => {
    mockQuery = query
    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
