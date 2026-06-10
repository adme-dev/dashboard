import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readBody = async (e: any) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a) }))

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a) }))

const mockCreateSourceAsset = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({
  createSourceAsset: (...a: unknown[]) => mockCreateSourceAsset(...a),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/source-assets/from-asset.post')

const assetId = '00000000-0000-4000-8000-000000000abc'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_STUDIO_ENABLED = 'true'
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
  mockCreateSourceAsset.mockResolvedValue({ id: 'src-1', status: 'approved' })
})
afterEach(() => {
  delete process.env.VIDEO_STUDIO_ENABLED
  delete process.env.VIDEO_GENERATION_ENABLED
})

describe('POST /agency/video/generation/source-assets/from-asset', () => {
  it('404s when the feature is disabled', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED
    await expect(handler({ body: { assetId } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('registers an existing video_asset as an approved source, deriving content type + owner', async () => {
    mockQueryOne.mockResolvedValue({ id: assetId, client_id: 'dealer-1', r2_key: 'media/dealer-1/car.png' })

    const res = await handler({ body: { assetId, subjectType: 'vehicle' } } as any)

    expect(mockCreateSourceAsset).toHaveBeenCalledWith({
      clientId: 'dealer-1',
      createdBy: 'user-1',
      r2Key: 'media/dealer-1/car.png',
      contentType: 'image/png',
      subjectType: 'vehicle',
    })
    expect(res).toEqual({ id: 'src-1', status: 'approved' })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
  })

  it('404s when the asset does not exist', async () => {
    mockQueryOne.mockResolvedValue(null)
    await expect(handler({ body: { assetId } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('rejects a non-uuid assetId', async () => {
    await expect(handler({ body: { assetId: 'nope' } } as any)).rejects.toMatchObject({ statusCode: 400 })
  })
})
