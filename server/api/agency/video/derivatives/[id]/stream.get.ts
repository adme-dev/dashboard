import { requireWriteAccess } from '~~/server/utils/auth'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { getAssetDerivative } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Derivative id is required' })

  const derivative = await getAssetDerivative(id)
  if (!derivative) throw createError({ statusCode: 404, statusMessage: 'Derivative not found' })

  const url = isStorageConfigured()
    ? (getPublicUrl(derivative.r2Key) ?? await getPresignedDownloadUrl(derivative.r2Key, 60 * 60))
    : `/api/_uploads/${derivative.r2Key}`
  return sendRedirect(event, url, 302)
})
