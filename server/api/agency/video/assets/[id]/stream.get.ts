// Authed video-asset redirect: 302 → a fresh presigned URL for the saved MP4.
// Re-presigns each hit (stable URL, no expiry). Mirrors the render-variant redirect.
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const row = await queryOne(`SELECT * FROM video_assets WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  const asset = mapVideoAssetRow(row)
  const url = isStorageConfigured()
    ? (getPublicUrl(asset.r2Key) ?? await getPresignedDownloadUrl(asset.r2Key, 60 * 60))
    : `/api/_uploads/${asset.r2Key}`
  return sendRedirect(event, url, 302)
})
