import { randomUUID } from 'crypto'
import { uploadFile, deleteFile } from '~~/server/utils/storage'

export function createBannerAssetStorageKey(fileName: string, userId: string): string {
  return `banner-assets/${userId}/${randomUUID()}/${fileName}`
}

function isExpectedBannerAssetStorageKey(key: string, fileName: string, userId: string): boolean {
  const prefix = `banner-assets/${userId}/`
  if (!key.startsWith(prefix) || !key.endsWith(`/${fileName}`)) return false
  const objectId = key.slice(prefix.length, -(fileName.length + 1))
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)
}

export async function uploadBannerAsset(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  precomputedKey = createBannerAssetStorageKey(fileName, userId)
): Promise<{ key: string, url: string, size: number }> {
  if (!isExpectedBannerAssetStorageKey(precomputedKey, fileName, userId)) {
    throw new Error('Invalid precomputed banner asset storage key')
  }
  return uploadFile(buffer, precomputedKey, mimeType)
}

export async function uploadBannerExport(
  buffer: Buffer,
  projectId: string,
  _fileName: string
): Promise<{ key: string, url: string, size: number }> {
  const uuid = randomUUID()
  const key = `banner-exports/${projectId}/${uuid}.zip`
  return uploadFile(buffer, key, 'application/zip')
}

export async function uploadBannerThumbnail(
  buffer: Buffer,
  projectId: string
): Promise<{ key: string, url: string, size: number }> {
  const key = `banner-thumbnails/${projectId}.png`
  return uploadFile(buffer, key, 'image/png')
}

export async function deleteBannerFile(r2Key: string): Promise<void> {
  return deleteFile(r2Key)
}
