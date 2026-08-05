import { createError, getRouterParam } from 'h3'

import { queryOne } from '~~/server/utils/db'
import {
  isBannerAssetDeliveryKey,
  verifyBannerAssetToken
} from '~~/server/utils/bannerStorage'

interface BannerAssetRow {
  id: string
  r2Key: string
  uploadedBy: string
}

interface R2Range {
  offset: number
  length: number
}

interface NativeR2Object {
  size: number
  httpEtag: string
  uploaded?: Date
  range?: R2Range
  body?: ReadableStream
  writeHttpMetadata: (headers: Headers) => void
}

interface NativeR2Range {
  offset?: number
  length?: number
  suffix?: number
}

interface NativeR2Bucket {
  get: (key: string, options?: { range?: NativeR2Range }) => Promise<NativeR2Object | null>
  head: (key: string) => Promise<NativeR2Object | null>
}

interface ParsedRange {
  offset: number
  length: number
  native: NativeR2Range
}

const PRIVATE_CACHE = 'private, max-age=300, must-revalidate'

function responseHeaders(object: NativeR2Object): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', PRIVATE_CACHE)
  headers.set('access-control-allow-origin', '*')
  headers.set('cross-origin-resource-policy', 'cross-origin')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  return headers
}

function rangeNotSatisfiable(object: NativeR2Object): Response {
  const headers = responseHeaders(object)
  headers.set('content-range', `bytes */${object.size}`)
  return new Response(null, { status: 416, headers })
}

function parseByteRange(value: string, size: number): ParsedRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return null

  const total = BigInt(size)
  if (!match[1]) {
    const requested = BigInt(match[2])
    if (requested <= 0n) return null
    const length = requested > total ? size : Number(requested)
    return {
      offset: size - length,
      length,
      native: { suffix: length }
    }
  }

  const start = BigInt(match[1])
  if (start >= total) return null
  const requestedEnd = match[2] ? BigInt(match[2]) : total - 1n
  if (requestedEnd < start) return null
  const end = requestedEnd >= total ? total - 1n : requestedEnd
  const offset = Number(start)
  const length = Number(end - start + 1n)
  return { offset, length, native: { offset, length } }
}

function stripWeakPrefix(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag
}

function matchesEntityTagList(value: string, current: string, weak: boolean): boolean {
  if (value.trim() === '*') return true
  return value.split(',').some((candidateValue) => {
    const candidate = candidateValue.trim()
    if (!/^(?:W\/)?"[\x21\x23-\x7e]*"$/.test(candidate)) return false
    if (weak) return stripWeakPrefix(candidate) === stripWeakPrefix(current)
    return !candidate.startsWith('W/') && candidate === current
  })
}

function parsedHttpDate(value: string | null): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function uploadedTimestamp(object: NativeR2Object): number | null {
  const timestamp = object.uploaded?.getTime()
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null
}

function representationNotModified(object: NativeR2Object, timestamp: number): boolean {
  const uploaded = uploadedTimestamp(object)
  return uploaded !== null && Math.floor(uploaded / 1000) <= Math.floor(timestamp / 1000)
}

function preconditionStatus(headers: Headers, object: NativeR2Object): 304 | 412 | null {
  const ifMatch = headers.get('if-match')
  if (ifMatch !== null) {
    if (!matchesEntityTagList(ifMatch, object.httpEtag, false)) return 412
  } else {
    const ifUnmodifiedSince = parsedHttpDate(headers.get('if-unmodified-since'))
    const uploaded = uploadedTimestamp(object)
    if (ifUnmodifiedSince !== null && uploaded !== null
      && Math.floor(uploaded / 1000) > Math.floor(ifUnmodifiedSince / 1000)) return 412
  }

  const ifNoneMatch = headers.get('if-none-match')
  if (ifNoneMatch !== null) {
    if (matchesEntityTagList(ifNoneMatch, object.httpEtag, true)) return 304
  } else {
    const ifModifiedSince = parsedHttpDate(headers.get('if-modified-since'))
    if (ifModifiedSince !== null && representationNotModified(object, ifModifiedSince)) return 304
  }
  return null
}

function ifRangeMatches(value: string | null, object: NativeR2Object): boolean {
  if (value === null) return true
  if (/^(?:W\/)?"/.test(value.trim())) {
    return matchesEntityTagList(value, object.httpEtag, false)
  }
  const timestamp = parsedHttpDate(value)
  return timestamp !== null && representationNotModified(object, timestamp)
}

function isInvalidRangeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: unknown, code?: unknown, status?: unknown, statusCode?: unknown }
  return value.name === 'InvalidRange'
    || value.code === 'InvalidRange'
    || value.status === 416
    || value.statusCode === 416
}

export default defineEventHandler(async (event) => {
  const cloudflareEnv = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env
  const secret = cloudflareEnv?.RENDER_LINK_SECRET
  const bucket = cloudflareEnv?.MEDIA_BUCKET as NativeR2Bucket | undefined
  if (typeof secret !== 'string'
    || new TextEncoder().encode(secret).byteLength < 32
    || !bucket
    || typeof bucket.get !== 'function'
    || typeof bucket.head !== 'function') {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset delivery is unavailable' })
  }

  const token = getRouterParam(event, 'token') || ''
  const capability = await verifyBannerAssetToken(token, secret)
  if (!capability) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid banner asset link' })
  }

  let asset: BannerAssetRow | null
  try {
    asset = await queryOne<BannerAssetRow>(
      `SELECT id, r2_key AS "r2Key", uploaded_by AS "uploadedBy"
         FROM banner_assets
        WHERE id = $1`,
      [capability.assetId]
    )
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset delivery is unavailable' })
  }
  if (!asset
    || typeof asset.id !== 'string'
    || typeof asset.r2Key !== 'string'
    || typeof asset.uploadedBy !== 'string'
    || asset.id.toLowerCase() !== capability.assetId
    || !isBannerAssetDeliveryKey(asset.r2Key, asset.uploadedBy)) {
    throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  }

  const requestHeaders = event.headers instanceof Headers
    ? event.headers
    : new Headers(event.headers as HeadersInit)
  let metadata: NativeR2Object | null
  try {
    metadata = await bucket.head(asset.r2Key)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }
  if (!metadata) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0
    || typeof metadata.httpEtag !== 'string'
    || typeof metadata.writeHttpMetadata !== 'function') {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }

  const headers = responseHeaders(metadata)
  const precondition = preconditionStatus(requestHeaders, metadata)
  if (precondition) return new Response(null, { status: precondition, headers })

  const rangeHeader = requestHeaders.get('range')
  const range = rangeHeader && ifRangeMatches(requestHeaders.get('if-range'), metadata)
    ? parseByteRange(rangeHeader, metadata.size)
    : undefined
  if (rangeHeader && range === null) return rangeNotSatisfiable(metadata)

  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`)
    headers.set('content-length', String(range.length))
  } else {
    headers.set('content-length', String(metadata.size))
  }

  if (event.method === 'HEAD') {
    return new Response(null, { status: range ? 206 : 200, headers })
  }

  let object: NativeR2Object | null
  try {
    object = await bucket.get(asset.r2Key, range ? { range: range.native } : undefined)
  } catch (error: unknown) {
    if (isInvalidRangeError(error)) return rangeNotSatisfiable(metadata)
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  if (!object.body) {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }
  return new Response(object.body, { status: range ? 206 : 200, headers })
})
