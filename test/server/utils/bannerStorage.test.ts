import { beforeEach, describe, expect, it, vi } from 'vitest'

const { uploadFile, deleteFile } = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn()
}))

vi.stubGlobal('crypto', {
  randomUUID: () => '12345678-1234-4234-8234-123456789abc'
})

vi.mock('crypto', () => ({ randomUUID: undefined }))

vi.mock('~~/server/utils/storage', () => ({ uploadFile, deleteFile }))

const {
  createBannerAssetStorageKey,
  uploadBannerAsset
} = await import('../../../server/utils/bannerStorage')

describe('banner asset storage keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadFile.mockResolvedValue({
      key: 'banner-assets/owner-1/12345678-1234-4234-8234-123456789abc/launch-car.jpg',
      url: 'https://cdn.example.test/launch-car.jpg',
      size: 4
    })
  })

  it('precomputes one exact key and uploads to that key', async () => {
    const key = createBannerAssetStorageKey('launch-car.jpg', 'owner-1')

    await expect(uploadBannerAsset(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'launch-car.jpg',
      'image/jpeg',
      'owner-1',
      key
    )).resolves.toMatchObject({ key })

    expect(key).toBe('banner-assets/owner-1/12345678-1234-4234-8234-123456789abc/launch-car.jpg')
    expect(uploadFile).toHaveBeenCalledWith(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      key,
      'image/jpeg'
    )
  })

  it('uses the request bucket directly and returns the first-party capability URL without AWS storage', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const key = createBannerAssetStorageKey('launch-car.jpg', ownerId)
    const put = vi.fn(async () => ({}))
    const head = vi.fn(async () => ({ size: 4 }))
    const mediaBucket = { put, head, delete: vi.fn() }

    await expect(uploadBannerAsset(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'launch-car.jpg',
      'image/jpeg',
      ownerId,
      key,
      {
        bucket: mediaBucket,
        assetUrl: 'https://app.xeroflow.test/api/public/banner-assets/v1.asset.signature'
      }
    )).resolves.toEqual({
      key,
      url: 'https://app.xeroflow.test/api/public/banner-assets/v1.asset.signature',
      size: 4
    })

    expect(put).toHaveBeenCalledWith(key, new Uint8Array([0xff, 0xd8, 0xff, 0x00]), {
      httpMetadata: { contentType: 'image/jpeg' }
    })
    expect(head).toHaveBeenCalledWith(key)
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('fails native persistence verification without disclosing the private R2 key', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const key = createBannerAssetStorageKey('launch-car.jpg', ownerId)
    const mediaBucket = {
      put: vi.fn(async () => ({})),
      head: vi.fn(async () => null),
      delete: vi.fn()
    }

    const upload = uploadBannerAsset(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'launch-car.jpg',
      'image/jpeg',
      ownerId,
      key,
      {
        bucket: mediaBucket,
        assetUrl: 'https://app.xeroflow.test/api/public/banner-assets/v1.asset.signature'
      }
    )

    await expect(upload).rejects.toThrow('R2 write failed: object not persisted after native put')
    await expect(upload).rejects.not.toThrow(key)
  })

  it('accepts only the exact first-party capability route shape for native uploads', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const key = createBannerAssetStorageKey('launch-car.jpg', ownerId)
    const mediaBucket = { put: vi.fn(), head: vi.fn(), delete: vi.fn() }

    await expect(uploadBannerAsset(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'launch-car.jpg',
      'image/jpeg',
      ownerId,
      key,
      {
        bucket: mediaBucket,
        assetUrl: 'https://app.xeroflow.test/api/public/banner-assets/v1.asset.signature/nested'
      }
    )).rejects.toThrow('Invalid Banner Studio asset delivery URL')
    expect(mediaBucket.put).not.toHaveBeenCalled()
  })

  it('rejects a precomputed key outside the actor and filename scope', async () => {
    await expect(uploadBannerAsset(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'launch-car.jpg',
      'image/jpeg',
      'owner-1',
      'banner-assets/another-owner/12345678-1234-4234-8234-123456789abc/launch-car.jpg'
    )).rejects.toThrow('Invalid precomputed banner asset storage key')

    expect(uploadFile).not.toHaveBeenCalled()
  })
})
