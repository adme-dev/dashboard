// server/utils/socialPublishing/mediaAssets.ts
// Typed, client-owned media for delegated (reviewed) social posts.
//
// Staff never supply media URLs. They reference a client-owned `banner_assets` / `video_assets` row; the
// server resolves the stored R2 object and captures its content identity (strong ETag + byte size + MIME)
// at submission. That identity is part of the reviewed snapshot, re-verified at dispatch, and pinned into
// the delivery URL the provider fetches: the public route below only streams bytes whose current ETag
// still equals the reviewed one (R2 conditional get), so a replaced object fails closed even when the
// asset UUID and storage key are unchanged. Delivery URLs are derived per dispatch/preview with a short
// expiry; they are never stored in the snapshot or logged.
import { createError, type H3Event } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getDevR2BucketAdapter } from '~~/server/utils/storage'
import { isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'

export type SocialMediaAssetKind = 'banner_asset' | 'video_asset'

export interface SocialMediaAssetRef {
  kind: SocialMediaAssetKind
  id: string
}

/** Content identity frozen into a reviewed revision. */
export interface SocialMediaAssetIdentity extends SocialMediaAssetRef {
  mediaType: 'image' | 'video'
  mimeType: string
  byteSize: number
  /** Normalized strong ETag of the stored object (no quotes / weak prefix). */
  etag: string
}

export interface SocialMediaAssetSummary extends SocialMediaAssetRef {
  name: string | null
  mediaType: 'image' | 'video'
  mimeType: string
  byteSize: number | null
  createdAt: string | null
}

export const MAX_SOCIAL_MEDIA_ASSETS = 10
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const VIDEO_MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime'
})
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov'
})
const MB = 1024 * 1024
/** Provider-compatibility ceilings (bytes). LinkedIn video uploads are buffered in the Worker. */
const LIMITS = Object.freeze({
  image: 10 * MB,
  instagramImage: 8 * MB,
  video: 300 * MB,
  linkedinVideo: 75 * MB
})

interface StoredObjectHead {
  size: number
  etag: string
}

interface NativeObject {
  size: number
  etag?: string
  httpEtag?: string
  body?: ReadableStream | null
  writeHttpMetadata?: (headers: Headers) => void
}

export interface SocialMediaBucket {
  head: (key: string) => Promise<NativeObject | null>
  get: (key: string, options?: { onlyIf?: { etagMatches: string } }) => Promise<NativeObject | null>
  /** True only for the native R2 binding, whose conditional get is atomic. */
  conditionalGet: boolean
}

export interface SocialMediaAssetDb {
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

const defaultDb: SocialMediaAssetDb = { queryRows: queryRowsFresh as SocialMediaAssetDb['queryRows'] }

interface StoredAssetRow {
  kind: SocialMediaAssetKind
  id: string
  client_id: string | null
  r2_key: string | null
  mime_type: string | null
  name: string | null
  uploaded_by: string | null
  byte_size: number | string | null
  created_at: string | null
}

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function mediaChanged(): never {
  throw createError({
    statusCode: 409,
    statusMessage: 'Reviewed media changed or is no longer available. Edit the draft and resubmit it for review.'
  })
}

export function normalizeEtag(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
  return /^[\x21\x23-\x7e]{1,128}$/.test(trimmed) ? trimmed : null
}

/** Validate untrusted `[{ kind, id }]` input (≤10, deduplicated by kind/id, order preserved). */
export function normalizeSocialMediaAssetRefs(value: unknown): SocialMediaAssetRef[] {
  if (value == null) return []
  if (!Array.isArray(value)) badRequest('mediaAssets must be an array')
  if (value.length > MAX_SOCIAL_MEDIA_ASSETS) badRequest(`mediaAssets can contain at most ${MAX_SOCIAL_MEDIA_ASSETS} items`)
  const refs: SocialMediaAssetRef[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) badRequest('Invalid media asset reference')
    const item = raw as Record<string, unknown>
    if (Object.keys(item).some(key => key !== 'kind' && key !== 'id')) badRequest('Invalid media asset reference')
    if (item.kind !== 'banner_asset' && item.kind !== 'video_asset') badRequest('Invalid media asset kind')
    if (typeof item.id !== 'string' || !UUID.test(item.id)) badRequest('Invalid media asset id')
    const ref = { kind: item.kind, id: item.id.toLowerCase() } as SocialMediaAssetRef
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  return refs
}

function videoMimeForKey(key: string): string | null {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(key)?.[1]?.toLowerCase()
  return extension ? VIDEO_MIME_BY_EXTENSION[extension] ?? null : null
}

function safeStorageKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 1024
    && !key.startsWith('/') && !key.split('/').some(part => part === '..' || part === '')
}

function rowMime(row: StoredAssetRow): string | null {
  if (row.kind === 'video_asset') return row.r2_key ? videoMimeForKey(row.r2_key) : null
  const mime = typeof row.mime_type === 'string' ? row.mime_type.toLowerCase().trim() : ''
  return IMAGE_MIME_TYPES.has(mime) || Object.values(VIDEO_MIME_BY_EXTENSION).includes(mime) ? mime : null
}

function rowStorageValid(row: StoredAssetRow): boolean {
  if (!safeStorageKey(row.r2_key)) return false
  if (row.kind === 'banner_asset') {
    return typeof row.uploaded_by === 'string' && isBannerAssetDeliveryKey(row.r2_key, row.uploaded_by)
  }
  return true
}

const ASSET_SELECT = `
  SELECT 'banner_asset'::text AS kind, b.id::text AS id, b.client_id::text AS client_id, b.r2_key,
         b.mime_type, b.name, b.uploaded_by::text AS uploaded_by, b.file_size AS byte_size,
         b.created_at::text AS created_at
    FROM banner_assets b
   WHERE b.client_id = $1 AND b.id = ANY($2::uuid[])
  UNION ALL
  SELECT 'video_asset'::text AS kind, v.id::text AS id, v.client_id::text AS client_id, v.r2_key,
         NULL::text AS mime_type, v.title AS name, v.created_by::text AS uploaded_by, NULL::bigint AS byte_size,
         v.created_at::text AS created_at
    FROM video_assets v
   WHERE v.client_id = $1 AND v.id = ANY($3::uuid[])`

async function loadClientAssetRows(
  clientId: string,
  refs: readonly SocialMediaAssetRef[],
  db: SocialMediaAssetDb
): Promise<Map<string, StoredAssetRow>> {
  if (!UUID.test(clientId)) return new Map()
  const bannerIds = refs.filter(ref => ref.kind === 'banner_asset').map(ref => ref.id)
  const videoIds = refs.filter(ref => ref.kind === 'video_asset').map(ref => ref.id)
  if (!bannerIds.length && !videoIds.length) return new Map()
  const rows = await db.queryRows<StoredAssetRow>(ASSET_SELECT, [clientId, bannerIds, videoIds])
  const byKey = new Map<string, StoredAssetRow>()
  for (const row of rows) {
    // Defense in depth: the SQL already filters by client; re-check the returned owner.
    if (row.client_id !== clientId) continue
    byKey.set(`${row.kind}:${String(row.id).toLowerCase()}`, row)
  }
  return byKey
}

/** Request binding first, then (no Cloudflare env at all) the local S3-API dev adapter. */
export function resolveSocialMediaBucket(event: H3Event): SocialMediaBucket | null {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const native = env?.MEDIA_BUCKET as { head?: unknown, get?: unknown } | undefined
  if (native && typeof native.head === 'function' && typeof native.get === 'function') {
    return {
      head: key => (native.head as SocialMediaBucket['head'])(key),
      get: (key, options) => (native.get as SocialMediaBucket['get'])(key, options),
      conditionalGet: true
    }
  }
  if (env) return null
  const dev = getDevR2BucketAdapter()
  if (!dev) return null
  return { head: key => dev.head(key), get: key => dev.get(key), conditionalGet: false }
}

async function headObject(bucket: SocialMediaBucket, key: string): Promise<StoredObjectHead | null> {
  let object: NativeObject | null
  try {
    object = await bucket.head(key)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Media storage is unavailable' })
  }
  if (!object) return null
  const etag = normalizeEtag(object.etag ?? object.httpEtag)
  if (!etag || !Number.isSafeInteger(object.size) || object.size <= 0) return null
  return { size: object.size, etag }
}

export interface ResolveSocialMediaAssetsInput {
  event: H3Event
  clientId: string
  refs: readonly SocialMediaAssetRef[]
  db?: SocialMediaAssetDb
  bucket?: SocialMediaBucket | null
}

/**
 * Resolve client-owned assets and capture their current content identity. Fails (no partial result) when
 * any reference is unknown, owned by another/no client, has an unsafe storage key, an unsupported MIME
 * type, or a missing/empty stored object.
 */
export async function resolveSocialMediaAssets(input: ResolveSocialMediaAssetsInput): Promise<SocialMediaAssetIdentity[]> {
  const refs = normalizeSocialMediaAssetRefs(input.refs)
  if (!refs.length) return []
  const rows = await loadClientAssetRows(input.clientId, refs, input.db ?? defaultDb)
  const bucket = input.bucket === undefined ? resolveSocialMediaBucket(input.event) : input.bucket
  if (!bucket) throw createError({ statusCode: 503, statusMessage: 'Media storage is unavailable' })

  const identities: SocialMediaAssetIdentity[] = []
  for (const ref of refs) {
    const row = rows.get(`${ref.kind}:${ref.id}`)
    if (!row || !rowStorageValid(row)) badRequest('Media asset not found for this client')
    const mimeType = rowMime(row)
    if (!mimeType) badRequest('Unsupported media type')
    const head = await headObject(bucket, row.r2_key!)
    if (!head) badRequest('Media asset file is missing')
    identities.push({
      kind: ref.kind,
      id: ref.id,
      mediaType: mimeType.startsWith('video/') ? 'video' : 'image',
      mimeType,
      byteSize: head.size,
      etag: head.etag
    })
  }
  return identities
}

/** Re-verify that every reviewed asset still exists for the client with the identical stored bytes. */
export async function assertSocialMediaAssetsCurrent(input: {
  event: H3Event
  clientId: string
  identities: readonly SocialMediaAssetIdentity[]
  db?: SocialMediaAssetDb
  bucket?: SocialMediaBucket | null
}): Promise<void> {
  if (!input.identities.length) return
  let current: SocialMediaAssetIdentity[]
  try {
    current = await resolveSocialMediaAssets({
      event: input.event,
      clientId: input.clientId,
      refs: input.identities.map(({ kind, id }) => ({ kind, id })),
      db: input.db,
      bucket: input.bucket
    })
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 503) throw error
    return mediaChanged()
  }
  for (const [index, expected] of input.identities.entries()) {
    const actual = current[index]
    if (!actual || actual.kind !== expected.kind || actual.id !== expected.id || actual.etag !== expected.etag
      || actual.byteSize !== expected.byteSize || actual.mimeType !== expected.mimeType) {
      mediaChanged()
    }
  }
}

/**
 * Provider-compatibility rules for the EFFECTIVE media of each target (delegated posts publish the same
 * asset list to every target). Throws an actionable 400 before submission.
 */
export function assertProviderCompatibleMedia(
  platforms: readonly string[],
  identities: readonly SocialMediaAssetIdentity[],
  options: { content: string, instagramTypes?: Record<string, string | undefined> } = { content: '' }
): void {
  const images = identities.filter(item => item.mediaType === 'image')
  const videos = identities.filter(item => item.mediaType === 'video')
  for (const item of images) {
    if (item.byteSize > LIMITS.image) badRequest('Images must be 10 MB or smaller')
  }
  for (const item of videos) {
    if (item.byteSize > LIMITS.video) badRequest('Videos must be 300 MB or smaller')
  }
  for (const platform of new Set(platforms)) {
    if (platform === 'instagram') {
      if (!identities.length) badRequest('Instagram requires at least one image or video')
      if (images.some(item => item.mimeType !== 'image/jpeg')) badRequest('Instagram images must be JPEG')
      if (images.some(item => item.byteSize > LIMITS.instagramImage)) badRequest('Instagram images must be 8 MB or smaller')
      const storyOrReel = Object.values(options.instagramTypes ?? {}).some(type => type === 'story' || type === 'reel')
      if (storyOrReel && identities.length !== 1) badRequest('Instagram stories and reels take exactly one media item')
      if (Object.values(options.instagramTypes ?? {}).includes('reel') && !videos.length) badRequest('Instagram reels require a video')
    } else if (platform === 'facebook') {
      if (videos.length > 1) badRequest('Facebook posts support one video')
      if (videos.length && images.length) badRequest('Facebook posts cannot mix images and video')
    } else if (platform === 'linkedin') {
      if (videos.length > 1) badRequest('LinkedIn posts support one video')
      if (videos.length && images.length) badRequest('LinkedIn posts cannot mix images and video')
      if (videos.some(item => item.byteSize > LIMITS.linkedinVideo)) badRequest('LinkedIn videos must be 75 MB or smaller')
      if (!identities.length && !options.content.trim()) badRequest('LinkedIn posts require text or media')
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Pinned delivery links

const TOKEN_DOMAIN = 'xeroflow.social-reviewed-media.v1:'
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{16,2048})\.([A-Za-z0-9_-]{43})$/
const MINIMUM_SECRET_BYTES = 32
export const SOCIAL_MEDIA_LINK_DEFAULT_TTL_SECONDS = 2 * 60 * 60

interface SocialMediaTokenPayload {
  k: 'b' | 'v'
  i: string
  c: string
  e: string
  s: number
  x: number
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlDecode(value: string): Uint8Array | null {
  try {
    const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function signature(body: string, secret: string): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${TOKEN_DOMAIN}${body}`)))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

/** RENDER_LINK_SECRET: request binding first, then the local process environment. */
export function resolveSocialMediaLinkSecret(event: H3Event): string | null {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const bound = env?.RENDER_LINK_SECRET
  const secret = typeof bound === 'string' ? bound : (env && 'RENDER_LINK_SECRET' in env ? null : process.env.RENDER_LINK_SECRET)
  return typeof secret === 'string' && new TextEncoder().encode(secret).byteLength >= MINIMUM_SECRET_BYTES ? secret : null
}

export async function signSocialMediaToken(
  identity: SocialMediaAssetIdentity,
  clientId: string,
  secret: string,
  expiresAtEpochSeconds: number
): Promise<string> {
  const payload: SocialMediaTokenPayload = {
    k: identity.kind === 'banner_asset' ? 'b' : 'v',
    i: identity.id,
    c: clientId,
    e: identity.etag,
    s: identity.byteSize,
    x: Math.floor(expiresAtEpochSeconds)
  }
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  return `v1.${body}.${b64urlEncode(await signature(body, secret))}`
}

export async function verifySocialMediaToken(
  token: string,
  secret: string,
  nowEpochSeconds = Date.now() / 1000
): Promise<(SocialMediaAssetRef & { clientId: string, etag: string, byteSize: number }) | null> {
  const match = TOKEN_PATTERN.exec(token)
  if (!match) return null
  const given = b64urlDecode(match[2]!)
  if (!given || !equalBytes(given, await signature(match[1]!, secret))) return null
  const decoded = b64urlDecode(match[1]!)
  if (!decoded) return null
  let payload: SocialMediaTokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(decoded))
  } catch {
    return null
  }
  if (!payload || (payload.k !== 'b' && payload.k !== 'v') || typeof payload.i !== 'string' || !UUID.test(payload.i)
    || typeof payload.c !== 'string' || !UUID.test(payload.c) || !normalizeEtag(payload.e)
    || !Number.isSafeInteger(payload.s) || !Number.isFinite(payload.x) || payload.x < nowEpochSeconds) return null
  return {
    kind: payload.k === 'b' ? 'banner_asset' : 'video_asset',
    id: payload.i.toLowerCase(),
    clientId: payload.c.toLowerCase(),
    etag: payload.e,
    byteSize: payload.s
  }
}

/**
 * Absolute, expiring, content-pinned URL for one reviewed asset. The file extension lets the existing
 * provider media classification (mediaTypeForUrl) recognise videos.
 */
export async function socialMediaDeliveryUrl(
  event: H3Event,
  clientId: string,
  identity: SocialMediaAssetIdentity,
  ttlSeconds = SOCIAL_MEDIA_LINK_DEFAULT_TTL_SECONDS
): Promise<string> {
  const secret = resolveSocialMediaLinkSecret(event)
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Media delivery signing is unavailable' })
  const origin = new URL(getAppUrl(event)).origin
  const token = await signSocialMediaToken(identity, clientId, secret, Date.now() / 1000 + ttlSeconds)
  return `${origin}/api/public/social-media/${token}.${EXTENSION_BY_MIME[identity.mimeType] ?? 'bin'}`
}

export const SOCIAL_MEDIA_CAPABILITY_PATH = /^\/api\/public\/social-media\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.(?:jpg|png|gif|webp|mp4|mov)$/

/**
 * Stream the exact reviewed object for a verified token. Returns null when the asset, owner, size or
 * ETag no longer match (the caller answers 404/412); never streams replaced bytes.
 */
export async function readPinnedSocialMedia(input: {
  event: H3Event
  token: string
  db?: SocialMediaAssetDb
  bucket?: SocialMediaBucket | null
}): Promise<{ status: 200, body: ReadableStream, headers: Headers } | { status: 403 | 404 | 412 | 503 }> {
  const secret = resolveSocialMediaLinkSecret(input.event)
  const bucket = input.bucket === undefined ? resolveSocialMediaBucket(input.event) : input.bucket
  if (!secret || !bucket) return { status: 503 }
  const capability = await verifySocialMediaToken(input.token.replace(/\.[a-z0-9]{2,4}$/, ''), secret)
  if (!capability) return { status: 403 }
  const rows = await loadClientAssetRows(capability.clientId, [capability], input.db ?? defaultDb)
  const row = rows.get(`${capability.kind}:${capability.id}`)
  const mimeType = row ? rowMime(row) : null
  if (!row || !mimeType || !rowStorageValid(row)) return { status: 404 }
  const head = await headObject(bucket, row.r2_key!).catch(() => null)
  if (!head) return { status: 404 }
  if (head.etag !== capability.etag || head.size !== capability.byteSize) return { status: 412 }
  let object: NativeObject | null
  try {
    object = await bucket.get(row.r2_key!, bucket.conditionalGet ? { onlyIf: { etagMatches: capability.etag } } : undefined)
  } catch {
    return { status: 503 }
  }
  // A failed R2 precondition returns metadata without a body.
  if (!object?.body || normalizeEtag(object.etag ?? object.httpEtag) !== capability.etag || object.size !== capability.byteSize) {
    return { status: 412 }
  }
  const headers = new Headers()
  headers.set('content-type', mimeType)
  headers.set('content-length', String(capability.byteSize))
  headers.set('etag', `"${capability.etag}"`)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('cross-origin-resource-policy', 'cross-origin')
  return { status: 200, body: object.body, headers }
}

// ---------------------------------------------------------------------------------------------------
// Scoped discovery

interface AssetListRow extends StoredAssetRow {}

export interface SocialMediaAssetPage {
  items: SocialMediaAssetSummary[]
  nextCursor: string | null
}

function encodeCursor(row: { created_at: string | null, kind: string, id: string }): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify([row.created_at, row.kind, row.id])))
}

function decodeCursor(value: unknown): [string, string, string] | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 400) badRequest('Invalid cursor')
  const bytes = b64urlDecode(value)
  try {
    const parsed = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null
    if (Array.isArray(parsed) && parsed.length === 3 && typeof parsed[0] === 'string' && !Number.isNaN(Date.parse(parsed[0]))
      && (parsed[1] === 'banner_asset' || parsed[1] === 'video_asset') && typeof parsed[2] === 'string' && UUID.test(parsed[2])) {
      return parsed as [string, string, string]
    }
  } catch {}
  return badRequest('Invalid cursor')
}

/** One client's publishable assets (caller has already authorized `clientId`). Metadata only. */
export async function listClientSocialMediaAssets(input: {
  clientId: string
  kind?: SocialMediaAssetKind
  limit?: number
  cursor?: string | null
  db?: SocialMediaAssetDb
}): Promise<SocialMediaAssetPage> {
  if (!UUID.test(input.clientId)) badRequest('Invalid clientId')
  if (input.kind && input.kind !== 'banner_asset' && input.kind !== 'video_asset') badRequest('Invalid media asset kind')
  const limit = Math.min(Math.max(Math.trunc(Number(input.limit) || 25), 1), 50)
  const cursor = decodeCursor(input.cursor)
  const params: unknown[] = [input.clientId, input.kind ?? null]
  let cursorSql = ''
  if (cursor) {
    params.push(cursor[0], cursor[1], cursor[2])
    cursorSql = 'AND (assets.created_at::timestamptz, assets.kind, assets.id) < ($3::timestamptz, $4::text, $5::text)'
  }
  params.push(limit + 1)
  const rows = await (input.db ?? defaultDb).queryRows<AssetListRow>(
    `SELECT * FROM (
       SELECT 'banner_asset'::text AS kind, b.id::text AS id, b.client_id::text AS client_id, b.r2_key,
              b.mime_type, b.name, b.uploaded_by::text AS uploaded_by, b.file_size AS byte_size,
              b.created_at::text AS created_at
         FROM banner_assets b
        WHERE b.client_id = $1 AND ($2::text IS NULL OR $2::text = 'banner_asset')
       UNION ALL
       SELECT 'video_asset'::text, v.id::text, v.client_id::text, v.r2_key, NULL::text, v.title,
              v.created_by::text, NULL::bigint, v.created_at::text
         FROM video_assets v
        WHERE v.client_id = $1 AND ($2::text IS NULL OR $2::text = 'video_asset')
     ) assets
     WHERE assets.created_at IS NOT NULL ${cursorSql}
     ORDER BY assets.created_at::timestamptz DESC, assets.kind DESC, assets.id DESC
     LIMIT $${params.length}`,
    params
  )
  const page = rows.slice(0, limit)
  const items = page
    .filter(row => row.client_id === input.clientId)
    .map((row) => {
      const mimeType = rowMime(row)
      return mimeType
        ? {
            kind: row.kind,
            id: row.id,
            name: row.name,
            mediaType: mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
            mimeType,
            byteSize: row.byte_size == null ? null : Number(row.byte_size),
            createdAt: row.created_at
          }
        : null
    })
    .filter((item): item is SocialMediaAssetSummary => item !== null)
  const last = page[page.length - 1]
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null }
}
