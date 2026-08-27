import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: Record<string, unknown>
}

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadConnection: vi.fn(),
  requireScope: vi.fn(),
  requireOwnedCatalog: vi.fn(),
  listAccessibleBusinesses: vi.fn(),
  listBusinesses: vi.fn(),
  listCatalogs: vi.fn(),
  createCatalog: vi.fn(),
  updateCatalog: vi.fn(),
  deleteCatalog: vi.fn(),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: mocks.requireRole,
}))

vi.mock('~~/server/utils/metaCatalogAccess', () => ({
  loadMetaCatalogConnection: mocks.loadConnection,
  requireMetaCatalogScope: mocks.requireScope,
  requireOwnedMetaCatalog: mocks.requireOwnedCatalog,
  listAccessibleMetaBusinesses: mocks.listAccessibleBusinesses,
}))

vi.mock('~~/server/utils/metaCatalogClient', () => ({
  listMetaBusinesses: mocks.listBusinesses,
  listMetaProductCatalogs: mocks.listCatalogs,
  createMetaProductCatalog: mocks.createCatalog,
  updateMetaProductCatalog: mocks.updateCatalog,
  deleteMetaProductCatalog: mocks.deleteCatalog,
}))

vi.mock('~~/server/utils/metaCatalogHttp', () => ({
  throwMetaCatalogHttpError: (error: unknown) => { throw error },
}))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & Record<string, unknown>
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query || {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body || {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const { default: getContext } = await import('~~/server/api/admin/meta-catalogs/context.get')
const { default: createCatalog } = await import('~~/server/api/admin/meta-catalogs/index.post')
const { default: renameCatalog } = await import('~~/server/api/admin/meta-catalogs/[catalogId].patch')
const { default: deleteCatalog } = await import('~~/server/api/admin/meta-catalogs/[catalogId].delete')

const connectionId = '11111111-1111-4111-8111-111111111111'
const connection = {
  id: connectionId,
  accountId: '1234',
  accountName: 'Dealer Ads',
  accessToken: 'secret-token',
  tokenExpiresAt: '2026-09-01T00:00:00.000Z',
  scopes: ['ads_management', 'business_management', 'catalog_management'],
}
const catalog = {
  id: 'cat-1',
  name: 'Dealer Vehicles',
  vertical: 'vehicles',
  productCount: 0,
  feedCount: 0,
  businessId: 'biz-1',
  businessName: 'Dealer Group',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireRole.mockResolvedValue({ id: 'owner-1' })
  mocks.loadConnection.mockResolvedValue({ ...connection })
  mocks.requireScope.mockImplementation((value: typeof connection) => {
    if (!value.scopes.includes('catalog_management')) {
      throw testGlobal.createError({ statusCode: 403, statusMessage: 'Catalog scope missing' })
    }
  })
  mocks.requireOwnedCatalog.mockResolvedValue({ ...catalog })
  mocks.listBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Dealer Group' }])
  mocks.listAccessibleBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Dealer Group' }])
  mocks.listCatalogs.mockResolvedValue([{ ...catalog }])
  mocks.createCatalog.mockResolvedValue({ ...catalog })
  mocks.updateCatalog.mockResolvedValue({ ...catalog, name: 'Renamed Catalog' })
  mocks.deleteCatalog.mockResolvedValue(undefined)
})

describe('Meta catalog admin routes', () => {
  it('stops at role authorization before loading a connection', async () => {
    mocks.requireRole.mockRejectedValueOnce(testGlobal.createError({ statusCode: 403, statusMessage: 'Forbidden' }))

    await expect(getContext({ query: { connectionId } } as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.loadConnection).not.toHaveBeenCalled()
    expect(mocks.listAccessibleBusinesses).not.toHaveBeenCalled()
  })

  it('returns consent state without calling catalog edges when scope is absent', async () => {
    mocks.loadConnection.mockResolvedValueOnce({
      ...connection,
      scopes: ['ads_management', 'business_management'],
    })

    const result = await getContext({ query: { connectionId } } as never)

    expect(result).toMatchObject({
      catalogAccessGranted: false,
      businesses: [],
      selectedBusinessId: null,
      catalogs: [],
    })
    expect(mocks.listAccessibleBusinesses).not.toHaveBeenCalled()
    expect(mocks.listCatalogs).not.toHaveBeenCalled()
  })

  it('blocks mutations when catalog scope is missing', async () => {
    mocks.loadConnection.mockResolvedValueOnce({
      ...connection,
      scopes: ['ads_management', 'business_management'],
    })

    await expect(createCatalog({
      body: { connectionId, businessId: 'biz-1', name: 'Dealer Vehicles', vertical: 'vehicles' },
    } as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.createCatalog).not.toHaveBeenCalled()
  })

  it('rejects an inaccessible Business before creation', async () => {
    await expect(createCatalog({
      body: { connectionId, businessId: 'biz-other', name: 'Dealer Vehicles', vertical: 'vehicles' },
    } as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.createCatalog).not.toHaveBeenCalled()
  })

  it('rejects a catalog that fails the ownership guard before rename', async () => {
    mocks.requireOwnedCatalog.mockRejectedValueOnce(testGlobal.createError({
      statusCode: 403,
      statusMessage: 'Catalog is not owned by an accessible Business',
    }))

    await expect(renameCatalog({
      params: { catalogId: 'cat-other' },
      body: { connectionId, name: 'Renamed Catalog' },
    } as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.updateCatalog).not.toHaveBeenCalled()
  })

  it('requires an exact catalog-name match before deletion', async () => {
    await expect(deleteCatalog({
      params: { catalogId: 'cat-1' },
      body: { connectionId, confirmationName: 'dealer vehicles' },
    } as never)).rejects.toMatchObject({ statusCode: 400 })

    expect(mocks.deleteCatalog).not.toHaveBeenCalled()
  })

  it('does not trim delete confirmation text before comparing it', async () => {
    await expect(deleteCatalog({
      params: { catalogId: 'cat-1' },
      body: { connectionId, confirmationName: ' Dealer Vehicles ' },
    } as never)).rejects.toMatchObject({ statusCode: 400 })

    expect(mocks.deleteCatalog).not.toHaveBeenCalled()
  })

  it('deletes a matching disposable catalog without force options', async () => {
    const result = await deleteCatalog({
      params: { catalogId: 'cat-1' },
      body: { connectionId, confirmationName: 'Dealer Vehicles' },
    } as never)

    expect(result).toEqual({ deleted: true, catalogId: 'cat-1' })
    expect(mocks.deleteCatalog).toHaveBeenCalledOnce()
    expect(mocks.deleteCatalog).toHaveBeenCalledWith('cat-1', 'secret-token')
  })
})
