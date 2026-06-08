// Public, token-gated render redirect — for social platforms fetching media_urls
// unauthenticated (incl. scheduled posts). Only valid HMAC tokens resolve; bucket stays private.
import { verifyRenderToken } from '~~/server/utils/audio/renderLinks'
import { getRenderJob } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const payload = await verifyRenderToken(token)
  if (!payload) throw createError({ statusCode: 403, statusMessage: 'Invalid render link' })

  const job = await getRenderJob(payload.jobId)
  const key = job?.variants?.[payload.format]
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render not available' })

  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`
  return sendRedirect(event, url, 302)
})
