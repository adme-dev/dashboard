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

  it.each([
    {
      name: 'Meta description behind an opaque Amex reference and blank payee',
      fields: { reference: 'AT000000000000000000001', description: 'FACEBK *TEST123456 DUBLIN (1007)', contact: { name: '' } },
      platform: 'meta'
    },
    {
      name: 'Meta description on a later Xero line item',
      fields: { reference: 'AT000000000000000000001', lineItems: [{ description: 'Advertising' }, { description: 'FACEBK *TEST123456 DUBLIN (1007)' }] },
      platform: 'meta'
    },
    {
      name: 'Meta reference when a generic description exists',
      fields: { reference: 'FACEBK *TEST123456', description: 'Card payment' },
      platform: 'meta'
    },
    {
      name: 'Meta contact when the other fields are generic',
      fields: { reference: 'AT000000000000000000001', description: 'Card payment', contact: { name: 'Meta Platforms' } },
      platform: 'meta'
    },
    {
      name: 'Google reference',
      fields: { reference: 'GAds Test Account', description: 'Card payment' },
      platform: 'google_ads'
    },
    {
      name: 'Google description behind an opaque reference',
      fields: { reference: 'AT000000000000000000002', description: 'GOOGLE *ADS' },
      platform: 'google_ads'
    },
    {
      name: 'an unrelated payment',
      fields: { reference: 'AT000000000000000000003', description: 'Office supplies' },
      platform: null
    },
    {
      name: 'absent optional text fields',
      fields: {},
      platform: null
    },
    {
      name: 'unrelated fragments that must not combine into a platform name',
      fields: { reference: 'GOOGLE', description: 'ADS consulting' },
      platform: null
    }
  ])('classifies $name without losing the reference', async ({ fields, platform }) => {
    mocks.xeroFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('Accounts?')) return { accounts: [{ accountID: 'amex-1' }] }
      if (path.startsWith('BankTransactions?')) {
        return { bankTransactions: [{
          bankTransactionID: 'charge-1', date: '2026-09-04', total: 98.88, type: 'SPEND', ...fields
        }] }
      }
      throw new Error(`Unexpected Xero path: ${path}`)
    })

    const handler = (await import('~~/server/api/agency/social/spend/bank-charges.get')).default
    const result = await handler({ query: { month: 9, year: 2026 }, context: {} } as Parameters<typeof handler>[0])

    expect(result).toMatchObject({ period: '2026-09', partial: false })
    if (platform) {
      expect(result.byPlatform[platform]).toMatchObject({
        total: 98.88,
        transactions: [expect.objectContaining({ bankTransactionId: 'charge-1', amount: 98.88, description: fields.reference })]
      })
      expect(result.total).toBe(98.88)
      expect(result.unmatched).toEqual([])
    } else {
      expect(result.byPlatform).toEqual({})
      expect(result.unmatchedTotal).toBe(98.88)
    }
  })

  it('does not reuse cached results from the old platform matcher', async () => {
    const legacyResult = { period: '2026-09', byPlatform: {}, total: 0, connected: true }
    const cache = {
      get: vi.fn(async (key: string) => key === 'spend:bankcharges:tenant-1:2026-09' ? JSON.stringify(legacyResult) : null),
      put: vi.fn().mockResolvedValue(undefined)
    }
    mocks.xeroFetch.mockResolvedValue({ accounts: [] })

    const handler = (await import('~~/server/api/agency/social/spend/bank-charges.get')).default
    await handler({ query: { month: 9, year: 2026 }, context: { cloudflare: { env: { CACHE: cache } } } } as Parameters<typeof handler>[0])

    expect(mocks.xeroFetch).toHaveBeenCalled()
    expect(cache.put).toHaveBeenCalledWith('spend:bankcharges:v2:tenant-1:2026-09', expect.any(String), { expirationTtl: 10800 })
  })
})
