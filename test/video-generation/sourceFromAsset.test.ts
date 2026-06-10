import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readBody = async (e: any) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a) }))

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
}))

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
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
  mockQueryOne.mockResolvedValue({
    id: assetId,
    client_id: 'dealer-1',
    created_by: 'user-1',
    title: 'Car',
    source_project_id: null,
    source_job_id: null,
    r2_key: 'media/dealer-1/car.png',
    format: 'png',
    width: 1200,
    height: 800,
    duration_sec: null,
    thumbnail_key: null,
    caption_vtt_key: null,
    transcript: null,
    metadata: {},
    created_at: 'now',
    updated_at: 'now',
  })
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
    const res = await handler({ body: { assetId, subjectType: 'vehicle' } } as any)

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('(va.created_by = $2 OR mp.created_by = $2)'),
      [assetId, 'user-1'],
    )
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

  it('404s when the editor cannot access the existing video_asset', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    mockQueryOne.mockResolvedValue(null)

    await expect(handler({ body: { assetId } } as any)).rejects.toMatchObject({ statusCode: 404 })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('(va.created_by = $2 OR mp.created_by = $2)'),
      [assetId, 'user-2'],
    )
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('rejects a non-uuid assetId', async () => {
    await expect(handler({ body: { assetId: 'nope' } } as any)).rejects.toMatchObject({ statusCode: 400 })
  })
})
