import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ importBrand: vi.fn(), body: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'producer' }) }))
vi.mock('~~/server/utils/banner/brandKitAccess', () => ({ requireBrandKitWriteAccess: async () => {} }))
vi.mock('~~/server/utils/banner/motorstackImport', () => ({ importMotorstackBrand: mocks.importBrand }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mocks.body)
const handler = (await import('~~/server/api/agency/banner-studio/brand-kits/motorstack.post')).default
const event = { context: { cloudflare: { env: { MOTORSTACK_BRAND_ASSETS: { listBrands() {}, getBrandKit() {}, getBrandAsset() {} } } } } } as unknown as Parameters<typeof handler>[0]

describe('public MotorStack import failure codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.body.mockResolvedValue({ brandId: 'mazda' })
  })
  it.each([
    ['MotorStack font bytes are invalid; no partial kit was saved', 'font_invalid', 502],
    ['MotorStack logo contains invalid or unsafe content; no partial kit was saved', 'logo_invalid', 502],
    ['MotorStack icon bytes are invalid', 'logo_invalid', 502],
    ['MotorStack request timed out; retry this brand', 'source_timeout', 504],
    ['MotorStack brand assets are not configured on this deployment', 'not_configured', 503],
    ['MotorStack brand exceeds the 40 MiB import limit', 'limit_exceeded', 502],
    ['MotorStack returned invalid brand metadata', 'metadata_invalid', 502],
    ['MotorStack asset is empty', 'source_unavailable', 502]
  ])('maps the known local error to %s without copying attached data', async (statusMessage, reasonCode, statusCode) => {
    mocks.importBrand.mockRejectedValue(createError({ statusCode, statusMessage, data: { key: 'secret-value' } }))
    try {
      await handler(event)
    } catch (error) {
      expect(error).toMatchObject({ statusCode, statusMessage: 'MotorStack brand import failed', data: { reasonCode } })
      expect(JSON.stringify(error)).not.toContain('secret-value')
      return
    }
    throw new Error('Expected failure')
  })
  it.each([
    new Error('Remote URL https://provider.test/?key=secret-value'),
    createError({ statusCode: 502, statusMessage: 'secret-value', data: { providerResponse: 'secret-value' } }),
    { statusCode: 502, statusMessage: 'MotorStack icon bytes are invalid', data: { key: 'secret-value' } }
  ])('never sends unknown remote messages or data to the client', async (source) => {
    mocks.importBrand.mockRejectedValue(source)
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500, statusMessage: 'MotorStack brand import failed', data: { reasonCode: 'import_failed' } })
  })
})
