// Authed video-asset redirect: 302 → a fresh presigned URL for the saved MP4.
// Re-presigns each hit (stable URL, no expiry). Mirrors the render-variant redirect.
import { requireWriteAccess } from '~~/server/utils/auth'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { getAccessibleVideoAsset } from '~~/server/utils/video/assets'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const asset = await getAccessibleVideoAsset(id, user)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  const url = isStorageConfigured()
    ? (getPublicUrl(asset.r2Key) ?? await getPresignedDownloadUrl(asset.r2Key, 60 * 60))
    : `/api/_uploads/${asset.r2Key}`
  return sendRedirect(event, url, 302)
})
