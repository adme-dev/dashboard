import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mockRequireAuth = vi.fn()
const mockReadMultipartFormData = vi.fn()
const mockUploadBannerAsset = vi.fn()
const mockCreateBannerAssetStorageKey = vi.fn()
const mockCreateBannerAssetId = vi.fn()
const mockBannerAssetDeliveryUrl = vi.fn()
const mockQueryOne = vi.fn()
const mockExecuteUpload = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(handler: T) => T
}
testGlobal.defineEventHandler = handler => handler

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readMultipartFormData: (...args: unknown[]) => mockReadMultipartFormData(...args)
  }
})

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>()
  return {
    ...original,
    timingSafeEqual: undefined
  }
})

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/bannerStorage', () => ({
  createBannerAssetId: (...args: unknown[]) => mockCreateBannerAssetId(...args),
  createBannerAssetStorageKey: (...args: unknown[]) => mockCreateBannerAssetStorageKey(...args),
  bannerAssetDeliveryUrl: (...args: unknown[]) => mockBannerAssetDeliveryUrl(...args),
  uploadBannerAsset: (...args: unknown[]) => mockUploadBannerAsset(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.xeroflow.test'
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/banner/godModeAssetUpload', () => ({
  executeGodModeBannerAssetUpload: (...args: unknown[]) => mockExecuteUpload(...args)
}))

const USER = { id: '11111111-1111-4111-8111-111111111111' }
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00])
const ASSET = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Launch-Car.jpg',
  mimeType: 'image/jpeg',
  fileSize: JPEG.length,
  r2Key: 'banner-assets/owner/object/Launch-Car.jpg',
  url: 'https://app.xeroflow.test/api/public/banner-assets/v1.asset.signature',
  thumbnailUrl: null,
  tags: [],
  uploadedBy: USER.id,
  createdAt: '2026-08-05T00:00:00.000Z'
}

function event(headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    path: '/api/agency/banner-studio/assets/upload',
    context: {},
    node: {
      req: {
        originalUrl: '/api/agency/banner-studio/assets/upload',
        headers: { host: 'app.xeroflow.test', ...headers },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
}

describe('POST /api/agency/banner-studio/assets/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(USER)
    mockReadMultipartFormData.mockResolvedValue([{
      name: 'file',
      filename: 'Launch Car.JPEG',
      type: 'image/jpeg; charset=binary',
      data: JPEG
    }])
    mockUploadBannerAsset.mockResolvedValue({ key: ASSET.r2Key, url: ASSET.url, size: JPEG.length })
    mockBannerAssetDeliveryUrl.mockResolvedValue(ASSET.url)
    mockCreateBannerAssetId.mockReturnValue(ASSET.id)
    mockCreateBannerAssetStorageKey.mockReturnValue(ASSET.r2Key)
    mockQueryOne.mockResolvedValue(ASSET)
    mockExecuteUpload.mockImplementation(async (_event, mutation) => {
      const stored = await mutation.uploadFile(mutation.r2Key)
      return await mutation.insertAsset(null, stored)
    })
  })

  it.each([
    ['no multipart data', null],
    ['no file field', [{ name: 'caption', data: Buffer.from('hero') }]],
    ['more than one file field', [
      { name: 'file', filename: 'Launch Car.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'file', filename: 'Second Car.jpg', type: 'image/jpeg', data: JPEG }
    ]]
  ])('requires exactly one multipart file field when there is %s', async (_case, multipart) => {
    mockReadMultipartFormData.mockResolvedValueOnce(multipart)
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUploadBannerAsset).not.toHaveBeenCalled()
  })

  it('validates content and stores the canonical filename, MIME, and byte size', async () => {
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(event())).resolves.toEqual(ASSET)

    expect(mockRequireAuth).toHaveBeenCalledTimes(1)
    expect(mockCreateBannerAssetStorageKey).toHaveBeenCalledWith('Launch-Car.jpg', USER.id)
    expect(mockUploadBannerAsset).toHaveBeenCalledWith(JPEG, 'Launch-Car.jpg', 'image/jpeg', USER.id, ASSET.r2Key)
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), [
      ASSET.id,
      'Launch-Car.jpg',
      'image/jpeg',
      JPEG.length,
      ASSET.r2Key,
      ASSET.url,
      USER.id
    ])
  })

  it('passes the request-scoped MEDIA_BUCKET binding to banner storage', async () => {
    const mediaBucket = { put: vi.fn(), head: vi.fn(), delete: vi.fn() }
    const request = event()
    ;(request.context as Record<string, unknown>).cloudflare = {
      env: {
        APP_URL: 'https://app.xeroflow.test',
        MEDIA_BUCKET: mediaBucket,
        RENDER_LINK_SECRET: 'render-link-secret-with-at-least-thirty-two-bytes'
      }
    }
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(request)).resolves.toEqual(ASSET)

    expect(mockUploadBannerAsset).toHaveBeenCalledWith(
      JPEG,
      'Launch-Car.jpg',
      'image/jpeg',
      USER.id,
      ASSET.r2Key,
      { bucket: mediaBucket, assetUrl: ASSET.url }
    )
    expect(mockBannerAssetDeliveryUrl).toHaveBeenCalledWith(
      ASSET.id,
      'https://app.xeroflow.test',
      'render-link-secret-with-at-least-thirty-two-bytes'
    )
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), [
      ASSET.id,
      'Launch-Car.jpg',
      'image/jpeg',
      JPEG.length,
      ASSET.r2Key,
      ASSET.url,
      USER.id
    ])
  })

  it('fails closed in Workers instead of entering AWS fallback when binding delivery is incomplete', async () => {
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default
    const missingBucket = event()
    ;(missingBucket.context as Record<string, unknown>).cloudflare = {
      env: { RENDER_LINK_SECRET: 'render-link-secret-with-at-least-thirty-two-bytes' }
    }

    await expect(handler(missingBucket)).rejects.toMatchObject({ statusCode: 503 })

    const missingSecret = event()
    ;(missingSecret.context as Record<string, unknown>).cloudflare = {
      env: { MEDIA_BUCKET: { put: vi.fn(), head: vi.fn(), delete: vi.fn() } }
    }
    await expect(handler(missingSecret)).rejects.toMatchObject({ statusCode: 503 })
    expect(mockUploadBannerAsset).not.toHaveBeenCalled()
  })

  it('preserves ordinary uploads without owner coordination headers', async () => {
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(event())).resolves.toEqual(ASSET)
    expect(mockExecuteUpload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      r2Key: ASSET.r2Key,
      uploadFile: expect.any(Function),
      insertAsset: expect.any(Function)
    }))
  })

  it('rejects a validated file whose digest does not match the active owner claim before R2 upload', async () => {
    const request = event({ 'x-banner-upload-digest': 'c'.repeat(64) })
    const { seedGodModeRouteAuditState } = await import('~~/server/utils/godMode/featureGate')
    seedGodModeRouteAuditState(request, {
      actorUserId: USER.id,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      routeOrTool: 'POST /api/agency/banner-studio/assets/upload',
      emergencyDisabled: false
    })
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(request)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Banner upload digest does not match validated content' })
    expect(mockExecuteUpload).not.toHaveBeenCalled()
    expect(mockUploadBannerAsset).not.toHaveBeenCalled()
  })

  it('accepts the validated digest when the edge runtime has no timingSafeEqual export', async () => {
    const request = event({
      'x-banner-upload-digest': '122fe4684bb6802ae6e8225410da6a48c48a7a05a5200ef83b097d8c653bc6fe'
    })
    const { seedGodModeRouteAuditState } = await import('~~/server/utils/godMode/featureGate')
    seedGodModeRouteAuditState(request, {
      actorUserId: USER.id,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      routeOrTool: 'POST /api/agency/banner-studio/assets/upload',
      emergencyDisabled: false
    })
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default

    await expect(handler(request)).resolves.toEqual(ASSET)
    expect(mockExecuteUpload).toHaveBeenCalledTimes(1)
  })

  it('returns the bounded upload error while preserving coordinator HTTP failures', async () => {
    const handler = (await import('~~/server/api/agency/banner-studio/assets/upload.post')).default
    mockExecuteUpload.mockRejectedValueOnce(new Error('R2 unavailable'))
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to upload banner asset' })

    mockExecuteUpload.mockRejectedValueOnce(Object.assign(new Error('not replayable'), { statusCode: 409, statusMessage: 'not replayable' }))
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409, statusMessage: 'not replayable' })
  })
})
