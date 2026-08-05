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
  range?: R2Range
  body?: ReadableStream
  writeHttpMetadata: (headers: Headers) => void
}

interface NativeR2Bucket {
  get: (key: string, options: { onlyIf: Headers, range: Headers }) => Promise<NativeR2Object | null>
  head: (key: string) => Promise<NativeR2Object | null>
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

function hasValidRangeHeader(headers: Headers): boolean {
  const range = headers.get('range')
  return !range || /^bytes=(?:\d+-\d*|-\d+)$/.test(range)
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

  const asset = await queryOne<BannerAssetRow>(
    `SELECT id, r2_key AS "r2Key", uploaded_by AS "uploadedBy"
       FROM banner_assets
      WHERE id = $1`,
    [capability.assetId]
  )
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
  if (!hasValidRangeHeader(requestHeaders)) {
    throw createError({ statusCode: 416, statusMessage: 'Invalid banner asset range' })
  }

  const isHead = event.method === 'HEAD'
  const object = isHead
    ? await bucket.head(asset.r2Key)
    : await bucket.get(asset.r2Key, { onlyIf: requestHeaders, range: requestHeaders })
  if (!object) {
    throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  }

  const headers = responseHeaders(object)
  if (isHead) {
    headers.set('content-length', String(object.size))
    return new Response(null, { status: 200, headers })
  }
  if (!object.body) {
    return new Response(null, {
      status: requestHeaders.has('if-none-match') ? 304 : 412,
      headers
    })
  }

  const range = object.range
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
    headers.set('content-length', String(range.length))
  } else {
    headers.set('content-length', String(object.size))
  }
  return new Response(object.body, { status: range ? 206 : 200, headers })
})
