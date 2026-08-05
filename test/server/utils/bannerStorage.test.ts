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
