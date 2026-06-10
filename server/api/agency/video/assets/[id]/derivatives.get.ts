import { requireWriteAccess } from '~~/server/utils/auth'
import { listAssetDerivatives } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const sourceAssetId = getRouterParam(event, 'id')
  if (!sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })
  return { derivatives: await listAssetDerivatives(sourceAssetId) }
})
