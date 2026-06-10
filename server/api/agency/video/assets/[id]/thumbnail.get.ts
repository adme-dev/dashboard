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
  if (!asset.thumbnailKey) throw createError({ statusCode: 404, statusMessage: 'Thumbnail not available' })
  const url = isStorageConfigured()
    ? (getPublicUrl(asset.thumbnailKey) ?? await getPresignedDownloadUrl(asset.thumbnailKey, 60 * 60))
    : `/api/_uploads/${asset.thumbnailKey}`
  return sendRedirect(event, url, 302)
})
