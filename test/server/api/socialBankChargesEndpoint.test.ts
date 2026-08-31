import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getActiveTokenForSession: vi.fn(),
  getSelectedTenant: vi.fn(),
  queryRows: vi.fn(),
  getAccountMonthlySpend: vi.fn(),
  xeroFetch: vi.fn(),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args),
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveTokenForSession: (...args: unknown[]) => mocks.getActiveTokenForSession(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mocks.getSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
}))

vi.mock('~~/server/utils/metaClient', () => ({
  getAccountMonthlySpend: (...args: unknown[]) => mocks.getAccountMonthlySpend(...args),
}))

vi.mock('~~/server/utils/xeroRateLimit', () => ({
  dedupedXeroCall: (_key: string, _label: string, fetcher: () => Promise<unknown>) => fetcher(),
}))

vi.mock('~~/server/utils/xeroClient', () => ({
  xeroFetch: (...args: unknown[]) => mocks.xeroFetch(...args),
}))

;(globalThis as any).eventHandler = (handler: unknown) => handler
;(globalThis as any).getQuery = (event: any) => event.query ?? {}

describe('GET /api/agency/social/spend/bank-charges', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
    mocks.getActiveTokenForSession.mockResolvedValue({ access_token: 'xero-token' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-1')
    mocks.queryRows.mockResolvedValue([])
    mocks.getAccountMonthlySpend.mockResolvedValue({ spend: 0 })
  })

  it('matches Xero bank outflows to their social platform and excludes inflows', async () => {
    mocks.xeroFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('Accounts?')) {
        return {
          accounts: [
            {
              accountID: 'bank-1',
              name: 'Agency credit card',
              type: 'BANK',
              bankAccountType: 'CREDITCARD',
            },
          ],
        }
      }

      if (path.startsWith('BankTransactions?')) {
        return {
          bankTransactions: [
            {
              bankTransactionID: 'spend-1',
              date: '2026-08-10T00:00:00.000Z',
              total: -120,
              reference: 'FACEBOOK ADS',
              contact: { name: 'Meta Platforms' },
              type: 'SPEND',
            },
            {
              bankTransactionID: 'receive-1',
              date: '2026-08-11T00:00:00.000Z',
              total: 50,
              reference: 'FACEBOOK REFUND',
              type: 'RECEIVE',
            },
          ],
        }
      }

      throw new Error(`Unexpected Xero path: ${path}`)
    })

    const handler = (await import('~~/server/api/agency/social/spend/bank-charges.get')).default
    const result = await handler({ query: { month: 8, year: 2026 }, context: {} } as any)
    const requestedPaths = mocks.xeroFetch.mock.calls.map(([options]) =>
      decodeURIComponent(String(options.path)).replace(/\+/g, ' '),
    )

    expect(result).toMatchObject({
      connected: true,
      partial: false,
      total: 120,
      unmatchedTotal: 0,
      accountsScanned: 1,
      accountsTotal: 1,
    })
    expect(result.byPlatform.meta).toEqual({
      total: 120,
      transactions: [
        expect.objectContaining({
          amount: 120,
          bankTransactionId: 'spend-1',
          description: 'FACEBOOK ADS',
        }),
      ],
    })
    expect(requestedPaths[0]).toContain('Accounts?where=Type=="BANK"')
    expect(requestedPaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining('Type=="CREDITCARD"'),
    ]))
  })

  it('marks an account-list failure as partial and does not cache it', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    }
    mocks.xeroFetch.mockRejectedValue(new Error('Xero unavailable'))

    const handler = (await import('~~/server/api/agency/social/spend/bank-charges.get')).default
    const result = await handler({
      query: { month: 8, year: 2026 },
      context: { cloudflare: { env: { CACHE: cache } } },
    } as any)

    expect(result).toMatchObject({
      connected: true,
      partial: true,
      total: 0,
      accountsScanned: 0,
      accountsTotal: 0,
    })
    expect(cache.put).not.toHaveBeenCalled()
  })
})
