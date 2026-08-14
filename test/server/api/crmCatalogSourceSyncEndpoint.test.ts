import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  synchronize: vi.fn(),
  dispatch: vi.fn(),
  requireClientCatalogAccess: vi.fn(),
  requireRole: vi.fn()
}))

vi.mock('~~/server/utils/crm/catalogSourceService', () => ({
  synchronizeCatalogSource: mocks.synchronize
}))

vi.mock('~~/server/utils/crm/catalogMerchantDispatch', () => ({
  enqueueMerchantCatalogReconciliationForSource: mocks.dispatch
}))

vi.mock('~~/server/utils/crm/clientCatalogAccess', () => ({
  requireClientCatalogAccess: mocks.requireClientCatalogAccess
}))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  requireRole: typeof mocks.requireRole
  getRouterParam: () => string
  readBody: () => Promise<Record<string, unknown>>
}
testGlobal.defineEventHandler = handler => handler
testGlobal.requireRole = mocks.requireRole
testGlobal.getRouterParam = () => '22222222-2222-4222-8222-222222222222'
testGlobal.readBody = async () => ({ client_id: '11111111-1111-4111-8111-111111111111' })

const staffHandler = (await import('../../../server/api/crm/data-sources/[id]/sync.post')).default
const portalHandler = (await import('../../../server/api/client-portal/crm/data-sources/[id]/sync.post')).default

describe('catalog source sync endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.synchronize.mockResolvedValue({ runId: 'run-1', fetched: 90, upserted: 90, removed: 0 })
    mocks.dispatch.mockResolvedValue(true)
    mocks.requireRole.mockResolvedValue({ email: 'staff@adme.net.au' })
    mocks.requireClientCatalogAccess.mockResolvedValue({
      clientId: '11111111-1111-4111-8111-111111111111',
      email: 'client@example.com'
    })
  })

  it('schedules Merchant publication after a successful staff sync', async () => {
    const event = {} as never
    const result = await staffHandler(event)

    expect(result).toMatchObject({ fetched: 90, upserted: 90 })
    expect(mocks.dispatch).toHaveBeenCalledWith(event, {
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222'
    })
    expect(mocks.dispatch.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.synchronize.mock.invocationCallOrder[0]!
    )
  })

  it('schedules Merchant publication after a successful client-portal sync', async () => {
    const event = {} as never
    const result = await portalHandler(event)

    expect(result).toMatchObject({ fetched: 90, upserted: 90 })
    expect(mocks.dispatch).toHaveBeenCalledWith(event, {
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222'
    })
  })
})
