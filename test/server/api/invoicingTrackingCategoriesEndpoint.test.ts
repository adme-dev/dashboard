import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { query?: Record<string, string> }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
}

const mocks = vi.hoisted(() => ({
  fetchDbTrackingCategories: vi.fn(),
  getSelectedTenant: vi.fn(),
  requireAuth: vi.fn(),
}))

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: mocks.getSelectedTenant,
}))

vi.mock('~~/server/utils/invoicing/tracking-categories', () => ({
  fetchDbTrackingCategories: mocks.fetchDbTrackingCategories,
  TRACKING_CATEGORIES: [{
    name: 'Static Media',
    coaCode: '220',
    gstType: 'GST on Income',
    description: 'Safe fallback',
  }],
}))

const { default: handler } = await import(
  '~~/server/api/agency/invoicing/tracking-categories.get'
)

describe('GET /api/agency/invoicing/tracking-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-1')
    mocks.fetchDbTrackingCategories.mockResolvedValue([{
      name: 'Tenant Media',
      coaCode: '330',
      gstType: 'GST on Expenses',
      description: 'Selected tenant option',
      xeroOptionId: 'option-1',
    }])
  })

  it('scopes the DB read to the selected Xero tenant', async () => {
    const result = await handler({} as never)

    expect(mocks.fetchDbTrackingCategories).toHaveBeenCalledWith('tenant-1')
    expect(result).toMatchObject({
      source: 'db',
      total: 1,
      categories: [{ name: 'Tenant Media', xeroOptionId: 'option-1' }],
    })
  })

  it('uses static data without querying the DB when no tenant is selected', async () => {
    mocks.getSelectedTenant.mockResolvedValue(null)

    const result = await handler({} as never)

    expect(mocks.fetchDbTrackingCategories).not.toHaveBeenCalled()
    expect(result).toEqual({
      source: 'static',
      total: 1,
      categories: [{
        name: 'Static Media',
        coaCode: '220',
        gstType: 'GST on Income',
        description: 'Safe fallback',
        vendors: [],
      }],
    })
  })

  it('does not resolve or query tenant data for an explicit static request', async () => {
    const result = await handler({ query: { source: 'static' } } as never)

    expect(mocks.getSelectedTenant).not.toHaveBeenCalled()
    expect(mocks.fetchDbTrackingCategories).not.toHaveBeenCalled()
    expect(result.source).toBe('static')
  })
})
