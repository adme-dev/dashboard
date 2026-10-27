import { createError, type H3Event } from 'h3'
import { BANNER_RENDER_LIMITS as LIMITS, BannerRenderError, parseBannerRenderRequest, type BannerRenderedItem, type BannerRenderRequest, type BannerRendererClient } from '#shared/bannerRenderContract'
import type { User } from '~~/server/utils/auth'
import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export const RASTER_EXPORT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const RASTER_EXPORT_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' } as const
const MAX_FORMATS = 25
// Bound the complete HTTP payload as well as each RPC batch.
const MAX_TOTAL_HTML_BYTES = LIMITS.MAX_REQUEST_HTML_BYTES
interface ProjectAccess { client_id: string | null, created_by: string | null }
interface WriteBucket {
  put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string, cacheControl: string }, sha256: string }): Promise<unknown>
  delete(key: string): Promise<void>
}

async function cleanupUnrecordedExport(bucket: WriteBucket, key: string, id: string) {
  try {
    await bucket.delete(key)
  } catch {
    console.error('Banner raster export cleanup failed', { exportId: id })
  }
}

export async function requireRasterProjectAccess(event: H3Event, user: User, project: ProjectAccess) {
  if (project.client_id) await requireSocialClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
}

function invalid(): never {
  throw createError({ statusCode: 400, statusMessage: 'Invalid banner export request' })
}
function unavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'Banner export service is unavailable' })
}
function corrupt(): never {
  throw createError({ statusCode: 502, statusMessage: 'Invalid banner renderer response' })
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

function parseRequest(body: unknown, mode: 'image' | 'gif') {
  const input = record(body)
  const allowed = mode === 'image' ? ['projectId', 'formats', 'quality', 'format', 'jpgQuality'] : ['projectId', 'formats', 'fps']
  if (Object.keys(input).some(key => !allowed.includes(key))) invalid()
  if (typeof input.projectId !== 'string' || !RASTER_EXPORT_UUID.test(input.projectId)) invalid()
  if (!Array.isArray(input.formats) || input.formats.length < 1 || input.formats.length > MAX_FORMATS) invalid()
  const quality = mode === 'image' && input.quality !== undefined ? input.quality : 1
  const format = mode === 'gif' ? 'gif' : input.format === undefined ? 'png' : input.format
  const jpgQuality = input.jpgQuality === undefined ? 90 : input.jpgQuality
  const fps = input.fps === undefined ? 10 : input.fps
  if ((quality !== 1 && quality !== 2) || !['png', 'jpg', 'gif'].includes(String(format)) || (mode === 'image' && format === 'gif')) invalid()
  if (typeof jpgQuality !== 'number' || !Number.isSafeInteger(jpgQuality) || jpgQuality < 1 || jpgQuality > 100) invalid()
  if (mode === 'gif' && (typeof fps !== 'number' || !Number.isSafeInteger(fps) || fps < 5 || fps > 15)) invalid()
  const batches: BannerRenderRequest[] = []
  const keys = new Set<string>()
  let htmlBytes = 0
  // Validate all batches before the first RPC, including later formats.
  for (let offset = 0; offset < input.formats.length; offset += LIMITS.MAX_ITEMS) {
    const items = input.formats.slice(offset, offset + LIMITS.MAX_ITEMS).map((value) => {
      const item = record(value)
      if (Object.keys(item).some(key => !['key', 'html', 'width', 'height'].includes(key))) invalid()
      // banner_exports.format_key is VARCHAR(50), narrower than the generic RPC key.
      if (typeof item.key !== 'string' || item.key.length > 50 || keys.has(item.key)) invalid()
      keys.add(item.key)
      return { ...item, scale: quality }
    })
    try {
      const request = parseBannerRenderRequest({ version: 1, expectedEnvironment: 'production', requestId: crypto.randomUUID(),
        output: format === 'jpg' ? 'jpeg' : format, ...(format === 'jpg' ? { jpegQuality: jpgQuality } : {}),
        ...(format === 'gif' ? { fps } : {}), items })
      for (const item of request.items) htmlBytes += new TextEncoder().encode(item.html).byteLength
      if (htmlBytes > MAX_TOTAL_HTML_BYTES) throw new BannerRenderError('LIMIT_EXCEEDED')
      batches.push(request)
    } catch (error) {
      if (error instanceof BannerRenderError && error.code === 'LIMIT_EXCEEDED') {
        throw createError({ statusCode: 413, statusMessage: 'Banner export exceeds rendering limits' })
      }
      invalid()
    }
  }
  return { projectId: input.projectId.toLowerCase(), format: format as keyof typeof RASTER_EXPORT_MIME, quality, batches }
}

/** Header/block verification only; no browser, codec or decompression on Pages. */
function encodedMetadata(bytes: Uint8Array, output: BannerRenderRequest['output']) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (output === 'png') {
    if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
      || view.getUint32(8) !== 13 || ascii(12, 4) !== 'IHDR') corrupt()
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    let offset = 8
    let hasData = false
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset)
      const type = ascii(offset + 4, 4)
      if (offset + length + 12 > bytes.length) corrupt()
      if (type === 'IDAT') hasData = true
      offset += length + 12
      if (type === 'IEND') {
        if (length || offset !== bytes.length || !hasData) corrupt()
        return { width, height, frames: 1 }
      }
    }
    corrupt()
  }
  if (output === 'jpeg') {
    if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) corrupt()
    let offset = 2
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) corrupt()
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]!
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) corrupt()
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) corrupt()
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), frames: 1 }
      }
      offset += length
    }
    corrupt()
  }
  if (bytes.length < 14 || !['GIF87a', 'GIF89a'].includes(ascii(0, 6))) corrupt()
  const width = view.getUint16(6, true)
  const height = view.getUint16(8, true)
  let offset = 13 + (bytes[10]! & 0x80 ? 3 * 2 ** ((bytes[10]! & 7) + 1) : 0)
  let frames = 0
  const delays: number[] = []
  let delay = 0
  function blocks() {
    while (offset < bytes.length) {
      const length = bytes[offset++]!
      if (!length) return
      offset += length
      if (offset > bytes.length) corrupt()
    }
    corrupt()
  }
  while (offset < bytes.length) {
    const marker = bytes[offset++]
    if (marker === 0x3b) {
      if (offset !== bytes.length || frames < 1) corrupt()
      return { width, height, frames, delays }
    }
    if (marker === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9) {
        if (offset + 6 > bytes.length || bytes[offset] !== 4 || bytes[offset + 5] !== 0) corrupt()
        delay = view.getUint16(offset + 2, true) * 10
      }
      blocks()
    } else if (marker === 0x2c) {
      if (offset + 9 > bytes.length) corrupt()
      const left = view.getUint16(offset, true)
      const top = view.getUint16(offset + 2, true)
      const frameWidth = view.getUint16(offset + 4, true)
      const frameHeight = view.getUint16(offset + 6, true)
      if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) corrupt()
      const packed = bytes[offset + 8]!
      offset += 9 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
      if (offset >= bytes.length || bytes[offset]! < 2 || bytes[offset]! > 8) corrupt()
      offset++
      blocks()
      frames++
      delays.push(delay)
      delay = 0
      if (frames > LIMITS.MAX_GIF_FRAMES) corrupt()
    } else corrupt()
  }
  corrupt()
}

const ERROR_STATUS: Record<string, number> = {
  INVALID_INPUT: 400, LIMIT_EXCEEDED: 413, UNAVAILABLE: 503, BROWSER_UNAVAILABLE: 503,
  RESOURCE_BLOCKED: 422, RESOURCE_FAILED: 502, UNSUPPORTED_TIMELINE: 422, TIMEOUT: 504, RENDER_FAILED: 502
}

async function verifyResponse(value: unknown, request: BannerRenderRequest): Promise<BannerRenderedItem[]> {
  if (!value || typeof value !== 'object') corrupt()
  const response = value as { version?: unknown, ok?: unknown, error?: { code?: unknown }, value?: { items?: unknown } }
  if (response.version !== 1) corrupt()
  if (response.ok === false) {
    const code = response.error?.code
    if (typeof code !== 'string' || !Object.hasOwn(ERROR_STATUS, code)) corrupt()
    // Never reflect worker messages, URLs or HTML across the HTTP boundary.
    throw createError({ statusCode: ERROR_STATUS[code], statusMessage: `Banner rendering failed: ${code}` })
  }
  if (response.ok !== true || !Array.isArray(response.value?.items) || response.value.items.length !== request.items.length) corrupt()
  let total = 0
  const items: BannerRenderedItem[] = []
  for (let index = 0; index < request.items.length; index++) {
    const expected = request.items[index]!
    const item = response.value.items[index] as BannerRenderedItem | null
    const mime = request.output === 'jpeg' ? 'image/jpeg' : `image/${request.output}`
    if (!item || item.key !== expected.key || item.output !== request.output || item.mime !== mime
      || item.width !== expected.width || item.height !== expected.height
      || item.pixelWidth !== expected.width * expected.scale || item.pixelHeight !== expected.height * expected.scale
      || !(item.bytes instanceof Uint8Array) || !Number.isSafeInteger(item.byteLength) || item.byteLength < 1
      || item.byteLength !== item.bytes.byteLength || item.byteLength > LIMITS.MAX_ITEM_OUTPUT_BYTES
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) corrupt()
    total += item.byteLength
    if (total > LIMITS.MAX_RESPONSE_BYTES) corrupt()
    const encoded = encodedMetadata(item.bytes, request.output)
    if (encoded.width !== item.pixelWidth || encoded.height !== item.pixelHeight || encoded.frames !== item.frames) corrupt()
    if (request.output === 'gif') {
      if (!Number.isSafeInteger(item.frames) || item.frames < 1 || item.frames > LIMITS.MAX_GIF_FRAMES
        || typeof item.durationSec !== 'number' || !Number.isFinite(item.durationSec) || item.durationSec <= 0
        || item.frames !== Math.ceil(item.durationSec * request.fps!)
        || item.frames * item.pixelWidth * item.pixelHeight > LIMITS.MAX_GIF_TOTAL_PIXELS
        || item.frameDelayMs !== Math.round(100 / request.fps!) * 10
        || encoded.delays?.some(delay => delay !== item.frameDelayMs)) corrupt()
    } else if (item.frames !== 1 || item.durationSec !== undefined || item.frameDelayMs !== undefined) corrupt()
    const digest = await crypto.subtle.digest('SHA-256', item.bytes as Uint8Array<ArrayBuffer>)
    const sha = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (sha !== item.sha256) corrupt()
    items.push(item)
  }
  return items
}

export async function renderBannerExports(event: H3Event, user: User, body: unknown, mode: 'image' | 'gif') {
  const parsed = parseRequest(body, mode)
  const project = await queryOneFresh<ProjectAccess>('SELECT client_id, created_by FROM banner_projects WHERE id = $1', [parsed.projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  await requireRasterProjectAccess(event, user, project)
  const env = (event.context as { cloudflare?: { env?: { BANNER_RENDERER_PRODUCTION?: BannerRendererClient, BANNER_RENDERER_STAGING?: BannerRendererClient, MEDIA_BUCKET?: WriteBucket } } }).cloudflare?.env
  // Binding presence selects the deployment environment without another Pages text variable.
  const production = env && Object.hasOwn(env, 'BANNER_RENDERER_PRODUCTION')
  const staging = env && Object.hasOwn(env, 'BANNER_RENDERER_STAGING')
  if (Boolean(production) === Boolean(staging)) unavailable()
  const renderer = production ? env?.BANNER_RENDERER_PRODUCTION : env?.BANNER_RENDERER_STAGING
  const environment = production ? 'production' : 'staging'
  const bucket = env?.MEDIA_BUCKET
  if (!renderer || typeof renderer.render !== 'function' || !bucket || typeof bucket.put !== 'function' || typeof bucket.delete !== 'function'
  ) unavailable()
  const results: Array<{ formatKey: string, url: string, fileSize: number }> = []
  for (const batch of parsed.batches) {
    batch.expectedEnvironment = environment
    let response: unknown
    try {
      response = await renderer.render(batch)
    } catch { unavailable() }
    // Validate all output before the batch's first write; release bytes before the next RPC.
    const items = await verifyResponse(response, batch)
    for (const item of items) {
      const id = crypto.randomUUID()
      const key = `banner-raster-exports/${parsed.projectId}/${id}.${parsed.format}`
      const url = `/api/agency/banner-studio/exports/${id}/download`
      try {
        const stored = await bucket.put(key, item.bytes, { httpMetadata: { contentType: item.mime, cacheControl: 'private, no-store' }, sha256: item.sha256 })
        if (!stored) unavailable()
      } catch {
        // No insert was attempted, so even an ambiguous put can be safely cleaned.
        await cleanupUnrecordedExport(bucket, key, id)
        unavailable()
      }
      try {
        const row = await queryOne<{ id: string }>(`
          INSERT INTO banner_exports (id, project_id, format_key, r2_key, url, file_size, export_type, quality, exported_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
        `, [id, parsed.projectId, item.key, key, url, item.byteLength, parsed.format, parsed.quality, user.id])
        if (!row || row.id !== id) unavailable()
      } catch {
        // An INSERT can commit and lose its reply. Delete only after a fresh read proves no row.
        let persisted: { id: string } | null | undefined
        try {
          persisted = await queryOneFresh<{ id: string }>('SELECT id FROM banner_exports WHERE id = $1', [id])
        } catch {
          console.error('Banner raster export persistence unresolved', { exportId: id })
        }
        if (persisted === null) await cleanupUnrecordedExport(bucket, key, id)
        unavailable()
      }
      results.push({ formatKey: item.key, url, fileSize: item.byteLength })
    }
  }
  return results
}
