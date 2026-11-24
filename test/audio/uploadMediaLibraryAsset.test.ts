// Uploads become library assets, so a still or a clip can be chosen in Prepare.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as unknown as Record<string, unknown>
const mockReadMultipart = vi.fn()
g.defineEventHandler = (fn: unknown) => fn
g.getRouterParam = (event: { params?: Record<string, string> }, name: string) => event.params?.[name]
g.setResponseStatus = vi.fn()
g.readMultipartFormData = (...args: unknown[]) => mockReadMultipart(...args)
g.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: vi.fn(async () => ({ id: 'staff-1', role: 'staff' }))
}))
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: vi.fn(async () => ({
    project: { id: 'p1', mediaType: 'av', createdBy: 'staff-1', clientId: 'client-1' },
    timeline: { id: 't1' }
  })),
  assertMediaProjectAccess: vi.fn()
}))

const RESERVED_ID = '99999999-9999-4999-8999-999999999999'
vi.mock('~~/server/utils/audio/godModeExternalMutations', () => ({
  executeGodModeMediaUpload: (_event: unknown, work: (run: unknown) => unknown) =>
    work({ ids: [RESERVED_ID], markDispatched: async () => {}, replay: false, replayResult: null })
}))

const mockUploadFile = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getPresignedDownloadUrl: vi.fn(),
  getPublicUrl: vi.fn(),
  isStorageConfigured: () => false,
  generateStorageKey: (category: string, filename: string) => `${category}/1700000000000-${filename.replace(/\.[^.]+$/, '')}-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.${filename.split('.').pop()}`,
  validateFileType: (type: string, category: string) => category === 'media-video' ? type.startsWith('video/') : type.startsWith('image/'),
  validateFileSize: () => true,
  getMaxFileSize: () => 1
}))

const mockCreateVideoAsset = vi.fn()
vi.mock('~~/server/utils/video/assets', () => ({
  createVideoAsset: (...args: unknown[]) => mockCreateVideoAsset(...args),
  isPreparablePictureKey: (key: string) => /\.(png|jpe?g)$/i.test(key)
}))
const mockAddAssetToProjectBucket = vi.fn()
vi.mock('~~/server/utils/video-asset-intelligence/db', () => ({
  addAssetToProjectBucket: (...args: unknown[]) => mockAddAssetToProjectBucket(...args)
}))

const { default: uploadHandler } = await import('~~/server/api/agency/audio/projects/[id]/upload-media.post')

const text = (value: string) => Buffer.from(value)
const upload = (parts: unknown[]) => {
  mockReadMultipart.mockResolvedValue(parts)
  return (uploadHandler as (event: unknown) => Promise<Record<string, unknown>>)({ params: { id: 'p1' } })
}

describe('upload-media creates a library asset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateVideoAsset.mockImplementation(async (input: { id: string }) => ({ id: input.id }))
  })

  it('files an uploaded PNG as a still asset that is its own preview picture', async () => {
    const res = await upload([
      { name: 'kind', data: text('still') },
      { name: 'file', filename: 'Forecourt_hero-shot.png', type: 'image/png', data: Buffer.from([1, 2, 3]) },
      { name: 'width', data: text('1920') },
      { name: 'height', data: text('1080') }
    ])

    const key = `media/p1/still/1700000000000-Forecourt_hero-shot-${RESERVED_ID}.png`
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: RESERVED_ID,
      clientId: 'client-1',
      createdBy: 'staff-1',
      title: 'Forecourt hero shot',
      sourceProjectId: 'p1',
      r2Key: key,
      format: 'still',
      width: 1920,
      height: 1080,
      durationSec: null,
      thumbnailKey: key
    }))
    expect(mockAddAssetToProjectBucket).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1', bucketKind: 'stills', assetId: RESERVED_ID, r2Key: key, role: 'uploaded-still'
    }))
    expect(res).toMatchObject({ r2_key: key, assetId: RESERVED_ID, thumbnailSaved: true })
  })

  it('saves the frame sent with a video as its preview frame', async () => {
    const res = await upload([
      { name: 'kind', data: text('footage') },
      { name: 'file', filename: 'walkaround.mp4', type: 'video/mp4', data: Buffer.from([9, 9]) },
      { name: 'poster', filename: 'poster.jpg', type: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff]) },
      { name: 'width', data: text('1280') },
      { name: 'height', data: text('720') },
      { name: 'durationSec', data: text('12.3456') }
    ])

    const key = `media/p1/footage/1700000000000-walkaround-${RESERVED_ID}.mp4`
    expect(mockUploadFile).toHaveBeenCalledWith(Buffer.from([0xff, 0xd8, 0xff]), `${key}.poster.jpg`, 'image/jpeg', expect.anything())
    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({
      r2Key: key, format: 'footage', width: 1280, height: 720, durationSec: 12.346, thumbnailKey: `${key}.poster.jpg`
    }))
    expect(mockAddAssetToProjectBucket).toHaveBeenCalledWith(expect.objectContaining({ bucketKind: 'footage', role: 'uploaded-footage' }))
    expect(res).toMatchObject({ assetId: RESERVED_ID, thumbnailSaved: true })
  })

  it('still creates the asset when a video arrives without a frame, and says no frame was saved', async () => {
    const res = await upload([
      { name: 'kind', data: text('footage') },
      { name: 'file', filename: 'clip.mov', type: 'video/quicktime', data: Buffer.from([9]) }
    ])
    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ thumbnailKey: null, width: null, height: null, durationSec: null }))
    expect(res).toMatchObject({ assetId: RESERVED_ID, thumbnailSaved: false })
  })

  it('uses the JPEG frame for a WebP still, which the picture tools cannot read as it is', async () => {
    await upload([
      { name: 'kind', data: text('still') },
      { name: 'file', filename: 'logo.webp', type: 'image/webp', data: Buffer.from([1]) },
      { name: 'poster', filename: 'poster.jpg', type: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff]) }
    ])
    const key = `media/p1/still/1700000000000-logo-${RESERVED_ID}.webp`
    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ r2Key: key, thumbnailKey: `${key}.poster.jpg` }))
  })

  it('rejects a preview frame that is not a JPEG before storing anything', async () => {
    await expect(upload([
      { name: 'kind', data: text('footage') },
      { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: Buffer.from([9]) },
      { name: 'poster', filename: 'poster.svg', type: 'image/svg+xml', data: Buffer.from('<svg/>') }
    ])).rejects.toMatchObject({ statusCode: 400, statusMessage: 'The preview frame must be a JPEG image' })
    expect(mockUploadFile).not.toHaveBeenCalled()
    expect(mockCreateVideoAsset).not.toHaveBeenCalled()
  })

  it('ignores sizes that are not whole pixel counts', async () => {
    await upload([
      { name: 'kind', data: text('still') },
      { name: 'file', filename: 'a.jpg', type: 'image/jpeg', data: Buffer.from([1]) },
      { name: 'width', data: text('1920; DROP') },
      { name: 'height', data: text('-4') }
    ])
    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ width: null, height: null }))
  })
})
