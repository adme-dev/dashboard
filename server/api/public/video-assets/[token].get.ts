import { resolveVideoAssetDownloadUrl, verifyVideoAssetToken } from '~~/server/utils/video/assetLinks'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const payload = await verifyVideoAssetToken(token)
  if (!payload) throw createError({ statusCode: 403, statusMessage: 'Invalid video asset link' })
  const url = await resolveVideoAssetDownloadUrl(payload.assetId)
  if (!url) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  return sendRedirect(event, url, 302)
})
