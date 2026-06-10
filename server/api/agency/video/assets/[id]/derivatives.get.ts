import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship, listAssetDerivatives } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const sourceAssetId = getRouterParam(event, 'id')
  if (!sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })
  const sourceAsset = await getAssetProjectRelationship(sourceAssetId)
  if (!sourceAsset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!sourceAsset.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  await requireVideoProjectWriteAccess(user, sourceAsset.projectId, 'Asset derivatives require an AV project')
  return { derivatives: await listAssetDerivatives(sourceAssetId) }
})
