import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
let mockQuery: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

;(globalThis as typeof globalThis & { eventHandler: <T>(fn: T) => T }).eventHandler = fn => fn
;(globalThis as typeof globalThis & { getQuery: () => Record<string, unknown> }).getQuery = () => mockQuery

describe('GET /api/agency/social/spend/control-diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'))
    mockQuery = { month: 6, year: 2026, platform: 'google' }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'conn-1',
          platform: 'google',
          accountId: '999-111',
          accountName: 'Google Ads',
          status: 'active',
          tokenExpiresAt: null,
          refreshToken: 'refresh-token',
          lastSyncedAt: '2026-06-25T00:00:00.000Z',
          clientId: 'client-1',
          spend: 100,
          budget: 200,
          campaignCount: 1
        }
      ])
      .mockResolvedValueOnce([
        {
          platform: 'google_ads',
          accountId: '999-222',
          accountName: 'Unmapped Google',
          spend: 300,
          budget: 500,
          campaignCount: 3
        }
      ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns control diagnostics for the selected period and normalized platform', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/control-diagnostics.get')).default

    const result = await handler({} as never)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06', 'google'])
    expect(mockQueryRows.mock.calls[1][1]).toEqual(['2026-06', 'google_ads'])
    const connectionSql = mockQueryRows.mock.calls[0][0] as string
    expect(connectionSql).toContain('LEFT JOIN google_credential_profiles gcp')
    expect(connectionSql).toContain('COALESCE(gcp.token_expires_at, sc.token_expires_at)')
    expect(connectionSql).toContain('gcp.refresh_token_encrypted IS NOT NULL')
    expect(result).toMatchObject({
      month: 6,
      year: 2026,
      period: '2026-06',
      platform: 'google',
      overallStatus: 'critical',
      summary: {
        connectedAccounts: 1,
        unmappedSpendGroups: 1,
        issueCount: 1
      }
    })
    expect(result.issues[0]).toMatchObject({
      type: 'unmapped_spend',
      platform: 'google',
      accountName: 'Unmapped Google',
      spend: 300
    })
  })
})
