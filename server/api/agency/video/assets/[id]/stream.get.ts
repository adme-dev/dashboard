// Authed video-asset redirect: 302 → a fresh presigned URL for the saved MP4.
// Re-presigns each hit (stable URL, no expiry). Mirrors the render-variant redirect.
import { requireWriteAccess } from '~~/server/utils/auth'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured, readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'
import { parseByteRange } from '~~/server/api/agency/audio/projects/[id]/media.get'
import { getAccessibleVideoAsset } from '~~/server/utils/video/assets'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const asset = await getAccessibleVideoAsset(id, user)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  // ?inline=1 streams the bytes from this origin instead of redirecting to storage.
  // Storage sends no CORS headers, so a redirected video cannot be drawn to a canvas;
  // Prepare needs that to capture the frame a mask is painted on. Honours Range.
  if (getQuery(event).inline === '1') {
    const requestBucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } } | undefined)?.cloudflare?.env?.MEDIA_BUCKET
    const range = parseByteRange(getHeader(event, 'range'))
    const object = await readStoredObject(asset.r2Key, { range: range ?? undefined, requestBucket })
    if (!object) throw createError({ statusCode: 404, statusMessage: 'Asset media not found' })
    setHeader(event, 'Content-Type', object.contentType)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Cache-Control', 'private, max-age=3600')
    if (object.etag) setHeader(event, 'ETag', object.etag)
    if (object.range) {
      setResponseStatus(event, 206)
      setHeader(event, 'Content-Range', `bytes ${object.range.start}-${object.range.end}/${object.size}`)
      setHeader(event, 'Content-Length', String(object.range.end - object.range.start + 1))
    } else {
      setHeader(event, 'Content-Length', String(object.size))
    }
    return sendStream(event, object.body as unknown as ReadableStream)
  }

  const url = isStorageConfigured()
    ? (getPublicUrl(asset.r2Key) ?? await getPresignedDownloadUrl(asset.r2Key, 60 * 60))
    : `/api/_uploads/${asset.r2Key}`
  return sendRedirect(event, url, 302)
})
