import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const assetProject = await getAssetProjectRelationship(id)
  if (!assetProject) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!assetProject.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  await requireVideoProjectWriteAccess(user, assetProject.projectId, 'Video asset media requires an AV project')
  const row = await queryOne(`SELECT * FROM video_assets WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  const asset = mapVideoAssetRow(row)
  if (!asset.captionVttKey) throw createError({ statusCode: 404, statusMessage: 'Captions not available' })
  const url = isStorageConfigured()
    ? (getPublicUrl(asset.captionVttKey) ?? await getPresignedDownloadUrl(asset.captionVttKey, 60 * 60))
    : `/api/_uploads/${asset.captionVttKey}`
  return sendRedirect(event, url, 302)
})
