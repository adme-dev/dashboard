import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured, readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'
import { getAssetDerivative } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Derivative id is required' })

  const derivative = await getAssetDerivative(id)
  if (!derivative) throw createError({ statusCode: 404, statusMessage: 'Derivative not found' })
  if (!derivative.projectId) throw createError({ statusCode: 400, statusMessage: 'Derivative is not attached to a project' })

  const existing = await getProjectWithCurrentTimeline(derivative.projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (user.role !== 'admin' && user.role !== 'owner' && existing.project.createdBy !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied to this project' })
  }

  // ?inline=1 serves the bytes from our own origin. Presigned R2 URLs send no CORS
  // headers, so the editor cannot read a redirected file (to draw it or reuse it).
  if (getQuery(event).inline === '1') {
    const requestBucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } } | undefined)?.cloudflare?.env?.MEDIA_BUCKET
    const object = await readStoredObject(derivative.r2Key, { requestBucket })
    if (!object) throw createError({ statusCode: 404, statusMessage: 'Derivative file not found' })
    setHeader(event, 'Content-Type', /\.png$/i.test(derivative.r2Key) ? 'image/png' : object.contentType)
    setHeader(event, 'Content-Length', String(object.size))
    setHeader(event, 'Cache-Control', 'private, max-age=3600')
    return sendStream(event, object.body as unknown as ReadableStream)
  }

  const url = isStorageConfigured()
    ? (getPublicUrl(derivative.r2Key) ?? await getPresignedDownloadUrl(derivative.r2Key, 60 * 60))
    : `/api/_uploads/${derivative.r2Key}`
  return sendRedirect(event, url, 302)
})
