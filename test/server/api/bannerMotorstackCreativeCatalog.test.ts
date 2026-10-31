import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ kit: vi.fn(), access: vi.fn(), catalog: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'producer' }) }))
vi.mock('~~/server/utils/banner/brandKits', () => ({ getBrandKit: mocks.kit }))
vi.mock('~~/server/utils/banner/brandKitAccess', () => ({ requireBrandKitReadAccess: mocks.access }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', mocks.query)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', createError)

const handler = (await import('~~/server/api/agency/banner-studio/motorstack/creative-catalog.get')).default
const kitId = '6455f665-02f9-4f10-83e4-1200154fb989'
const event = { context: { cloudflare: { env: { MOTORSTACK_BRAND_ASSETS: { listCreativeCatalog: mocks.catalog } } } } } as unknown as Parameters<typeof handler>[0]

describe('MotorStack editor catalogue boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReturnValue({ kitId, kind: 'offers' })
    mocks.kit.mockResolvedValue({ id: kitId, clientId: null, sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=geely' })
    mocks.catalog.mockResolvedValue({ schemaVersion: 1, brand: { id: 'geely', name: 'Geely Auto Australia' }, kind: 'offers', updatedAt: null, items: [{ title: 'Offer', model: 'EX5', variant: null, price: null, priceLabel: null, offer: 'Offer', endDate: '2026-10-31', disclaimer: 'Terms apply.', hasImage: true }] })
  })

  it('scopes the request through the saved kit and returns validated offer terms', async () => {
    const result = await handler(event)
    expect(mocks.access).toHaveBeenCalledWith(event, null)
    expect(mocks.catalog).toHaveBeenCalledWith({ brandId: 'geely', kind: 'offers' })
    expect(result.items[0]).toMatchObject({ endDate: '2026-10-31', disclaimer: 'Terms apply.' })
  })

  it('never calls MotorStack if kit access is denied or provenance is absent', async () => {
    mocks.access.mockRejectedValueOnce(createError({ statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.kit.mockResolvedValueOnce({ id: kitId, clientId: null, sourceUrl: 'https://example.com/#brand=geely' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 422 })
    expect(mocks.catalog).not.toHaveBeenCalled()
  })

  it('rejects a response for a different OEM', async () => {
    mocks.catalog.mockResolvedValueOnce({ schemaVersion: 1, brand: { id: 'ford', name: 'Ford' }, kind: 'offers', updatedAt: null, items: [] })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 502 })
  })
})
