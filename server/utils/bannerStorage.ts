import { randomUUID } from 'crypto'
import { uploadFile, deleteFile } from '~~/server/utils/storage'

export async function uploadBannerAsset(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string
): Promise<{ key: string; url: string; size: number }> {
  const uuid = randomUUID()
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const key = `banner-assets/${userId}/${uuid}/${fileName}`
  return uploadFile(buffer, key, mimeType)
}

export async function uploadBannerExport(
  buffer: Buffer,
  projectId: string,
  fileName: string
): Promise<{ key: string; url: string; size: number }> {
  const uuid = randomUUID()
  const key = `banner-exports/${projectId}/${uuid}.zip`
  return uploadFile(buffer, key, 'application/zip')
}

export async function uploadBannerThumbnail(
  buffer: Buffer,
  projectId: string
): Promise<{ key: string; url: string; size: number }> {
  const key = `banner-thumbnails/${projectId}.png`
  return uploadFile(buffer, key, 'image/png')
}

export async function deleteBannerFile(r2Key: string): Promise<void> {
  return deleteFile(r2Key)
}
