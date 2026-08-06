import { createError, getRouterParam } from 'h3'

import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

interface BannerRenderJob {
  id: string
  project_id: string
  r2_key: string | null
  status: string
}

interface R2Object {
  size: number
  httpEtag?: string
  body?: ReadableStream
}

interface R2Bucket {
  head: (key: string) => Promise<R2Object | null>
  get: (key: string, options?: { range?: { offset?: number, length?: number, suffix?: number } }) => Promise<R2Object | null>
}

interface ByteRange {
  offset: number
  length: number
  native: { offset?: number, length?: number, suffix?: number }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const JOB_ID_PATTERN = new RegExp(`^${UUID}$`, 'i')
const VIDEO_KEY_PATTERN = new RegExp(`^banner-videos/(${UUID})/([A-Za-z0-9][A-Za-z0-9._-]{0,191}\\.mp4)$`, 'i')

function deliveryHeaders(object: R2Object, filename: string): Headers {
  const headers = new Headers({
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="${filename}"`,
    'x-content-type-options': 'nosniff'
  })
  if (typeof object.httpEtag === 'string' && object.httpEtag) headers.set('etag', object.httpEtag)
  return headers
}

function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return null

  const startText = match[1]
  const endText = match[2]
  if (!startText) {
    const suffix = Number(endText)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    const length = Math.min(suffix, size)
    return { offset: size - length, length, native: { suffix: length } }
  }

  const offset = Number(startText)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) return null
  const requestedEnd = endText ? Number(endText) : size - 1
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return null
  const end = Math.min(requestedEnd, size - 1)
  const length = end - offset + 1
  return { offset, length, native: { offset, length } }
}

function isSafeVideoKey(key: string | null, projectId: string): key is string {
  if (typeof key !== 'string' || typeof projectId !== 'string' || !JOB_ID_PATTERN.test(projectId)) return false
  const match = VIDEO_KEY_PATTERN.exec(key)
  return Boolean(match && match[1].toLowerCase() === projectId.toLowerCase())
}

function storageUnavailable(message = 'Banner video storage is unavailable'): never {
  throw createError({ statusCode: 503, statusMessage: message })
}

function notFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Banner video not found' })
}

function rangeNotSatisfiable(object: R2Object, filename: string): Response {
  const headers = deliveryHeaders(object, filename)
  headers.set('content-range', `bytes */${object.size}`)
  return new Response(null, { status: 416, headers })
}

function invalidRangeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: unknown, code?: unknown, status?: unknown, statusCode?: unknown }
  return value.name === 'InvalidRange' || value.code === 'InvalidRange' || value.status === 416 || value.statusCode === 416
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id') || ''
  if (!JOB_ID_PATTERN.test(id)) notFound()

  let job: BannerRenderJob | null
  try {
    job = await queryOne<BannerRenderJob>(
      `SELECT id, project_id, r2_key, status
         FROM banner_render_jobs
        WHERE id = $1`,
      [id]
    )
  } catch {
    storageUnavailable('Banner video delivery is unavailable')
  }
  if (!job || job.id !== id || job.status !== 'done' || !isSafeVideoKey(job.r2_key, job.project_id)) notFound()

  const bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: unknown } } }).cloudflare?.env?.MEDIA_BUCKET as R2Bucket | undefined
  if (!bucket || typeof bucket.head !== 'function' || typeof bucket.get !== 'function') storageUnavailable()

  let metadata: R2Object | null
  try {
    metadata = await bucket.head(job.r2_key)
  } catch {
    storageUnavailable()
  }
  if (!metadata) notFound()
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) storageUnavailable()

  const filename = job.r2_key.slice(job.r2_key.lastIndexOf('/') + 1)
  const headers = deliveryHeaders(metadata, filename)
  const requestHeaders = event.headers instanceof Headers
    ? event.headers
    : new Headers(event.headers as HeadersInit)
  const rangeHeader = requestHeaders.get('range')
  const range = rangeHeader ? parseByteRange(rangeHeader, metadata.size) : undefined
  if (rangeHeader && !range) return rangeNotSatisfiable(metadata, filename)

  headers.set('content-length', String(range?.length ?? metadata.size))
  if (range) headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`)

  if (event.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers })

  let object: R2Object | null
  try {
    object = await bucket.get(job.r2_key, range ? { range: range.native } : undefined)
  } catch (error) {
    if (invalidRangeError(error)) return rangeNotSatisfiable(metadata, filename)
    storageUnavailable()
  }
  if (!object) notFound()
  if (!object.body) storageUnavailable()
  return new Response(object.body, { status: range ? 206 : 200, headers })
})
