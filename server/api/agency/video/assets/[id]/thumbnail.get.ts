import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { isPreparablePictureKey, mapVideoAssetRow } from '~~/server/utils/video/assets'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const assetProject = await getAssetProjectRelationship(id)
  if (!assetProject) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!assetProject.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  await requireVideoProjectWriteAccess(user, assetProject.projectId, 'Video asset media requires an AV project')
  // Fresh: a frame saved a moment ago must not be answered with a cached "no thumbnail".
  const row = await queryOneFresh(`SELECT * FROM video_assets WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  const asset = mapVideoAssetRow(row)
  // A PNG or JPEG asset is its own preview picture.
  const key = asset.thumbnailKey || (isPreparablePictureKey(asset.r2Key) ? asset.r2Key : null)
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Thumbnail not available' })
  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`
  return sendRedirect(event, url, 302)
})
