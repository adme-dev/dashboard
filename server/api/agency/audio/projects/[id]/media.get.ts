// Same-origin media proxy for the editor preview + waveforms.
//
// Presigned R2 URLs live on r2.cloudflarestorage.com, which sends no CORS
// headers — so <img crossOrigin> / <video crossOrigin> (needed to draw into the
// preview canvas) fail silently and the preview goes black. Streaming the bytes
// from our own origin fixes that. Only keys that appear in THIS project's
// current timeline are served (no arbitrary-key reads). Honours Range so
// <video> can seek.
import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'

export function parseByteRange(header: string | undefined, size?: number): { start: number; end?: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (!match) return null
  const [, startRaw, endRaw] = match
  if (startRaw === '' && endRaw === '') return null
  if (startRaw === '') {
    // Suffix range: last N bytes — needs the size to resolve.
    if (size == null) return null
    const suffix = Number(endRaw)
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : null
  }
  const start = Number(startRaw)
  const end = endRaw === '' ? undefined : Number(endRaw)
  if (!Number.isFinite(start) || start < 0 || (end != null && (end < start || !Number.isFinite(end)))) return null
  return { start, end }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const key = String(getQuery(event).key ?? '')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'key is required' })

  const res = await getProjectWithCurrentTimeline(id)
  if (!res?.timeline) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const parsed = TimelineStateSchema.safeParse(res.timeline.state)
  if (!parsed.success || !collectClipKeys(parsed.data).includes(key)) {
    throw createError({ statusCode: 404, statusMessage: 'Media is not part of this project' })
  }

  const requestBucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: R2BucketBinding } } } | undefined)?.cloudflare?.env?.MEDIA_BUCKET
  const range = parseByteRange(getHeader(event, 'range'))
  const object = await readStoredObject(key, { range: range ?? undefined, requestBucket })
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Media not found' })

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
})
