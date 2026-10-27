import { Readable } from 'node:stream'
import { timingSafeEqual } from 'node:crypto'
import { createError, getHeader, getRequestURL, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { bannerEngineCapabilitySchema, type BannerEngineCapability } from '../../../shared/bannerEngine'
import { ENGINE_JOB_LIMITS } from '../../../shared/bannerEngineJobs'
import { readEngineJobStream, type EngineJobBucket } from './engineJobStorage'

export interface EngineJobConfig {
  capabilities: BannerEngineCapability[]
  serviceToken: string
  bucket: EngineJobBucket
  allowLoopback: boolean
}
function engineJobPlatformRequest(event: H3Event): Request | undefined {
  // Nitro retains the original platform Request here, and also exposes the
  // flattened cloudflare context to runtime plugins. Never accept JSON-shaped
  // objects or reconstruct a trusted URL from forwarding headers.
  const original: unknown = event.context._platform?.cloudflare?.request
  if (original instanceof Request) return original
  const exposed: unknown = event.context.cloudflare?.request
  return exposed instanceof Request ? exposed : undefined
}
export function engineJobPrivateHeaders(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Vary', 'Cookie, Authorization')
}
export function engineJobConfig(event: H3Event): EngineJobConfig {
  const bindings = event.context.cloudflare?.env ?? {}
  const setting = (key: string) => Object.hasOwn(bindings, key) ? bindings[key] : process.env[key]
  const bucket = bindings.BANNER_ENGINE_BUCKET as EngineJobBucket | undefined
  try {
    if (setting('BANNER_ENGINE_ENABLED') !== 'true')
      throw new Error('disabled')
    const serviceToken = z.string().min(32).max(512).regex(/^[\x21-\x7e]+$/).parse(setting('BANNER_ENGINE_SERVICE_TOKEN'))
    const capabilities = z.array(bannerEngineCapabilitySchema).min(1).max(8).parse(JSON.parse(setting('BANNER_ENGINE_CAPABILITIES')))
    const pins = new Set<string>()
    for (const capability of capabilities) {
      const key = `${capability.engine.id}:${capability.engine.version}:${capability.inputMimeType}`
      if (!['photocraft', 'vectorcraft'].includes(capability.engine.id) || pins.has(key))
        throw new Error('Invalid capabilities')
      pins.add(key)
    }
    if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function')
      throw new Error('No private bucket')
    return { capabilities, serviceToken, bucket, allowLoopback: setting('BANNER_ENGINE_ALLOW_LOOPBACK') === 'true' }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Banner engine jobs are unavailable' })
  }
}
export function assertEngineServiceAuth(event: H3Event, config: EngineJobConfig): void {
  // Only the native request URL or the actual TLS socket establishes transport.
  // Never upgrade plaintext based on a caller-supplied forwarded-proto header.
  const native = engineJobPlatformRequest(event) ?? (event.web?.request instanceof Request ? event.web.request : undefined)
  const url = native ? new URL(native.url) : getRequestURL(event, { xForwardedProto: false, xForwardedHost: false })
  const peer = event.node.req.socket?.remoteAddress
  const loopback = config.allowLoopback && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '')
  if (url.protocol !== 'https:' && !loopback)
    throw createError({ statusCode: 403, statusMessage: 'Engine service requires TLS' })
  const supplied = Buffer.from(getHeader(event, 'authorization') ?? '')
  const expected = Buffer.from(`Bearer ${config.serviceToken}`)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw createError({ statusCode: 401, statusMessage: 'Engine service authentication required' })
}
export async function readEngineJobJson(event: H3Event, limit: number = ENGINE_JOB_LIMITS.jsonBytes): Promise<unknown> {
  const encoding = getHeader(event, 'content-encoding')
  if (encoding && encoding !== 'identity')
    throw createError({ statusCode: 415, statusMessage: 'Compressed engine bodies are unsupported' })
  if (!/^application\/json(?:\s*;.*)?$/i.test(getHeader(event, 'content-type') ?? ''))
    throw createError({ statusCode: 415, statusMessage: 'Engine body must be JSON' })
  const length = getHeader(event, 'content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw createError({ statusCode: 413, statusMessage: 'Engine body exceeds byte limit' })
  }
  const platform = engineJobPlatformRequest(event)
  const native = platform ?? (event.web?.request instanceof Request ? event.web.request : undefined)
  const stream = (native && !native.bodyUsed ? native.body : undefined) ?? (event.node.req instanceof Readable
    ? Readable.toWeb(event.node.req) as ReadableStream<Uint8Array>
    : undefined)
  let bytes: Uint8Array
  if (stream) {
    bytes = await readEngineJobStream(stream, limit)
  } else {
    // cloudflare_pages already consumed the platform Request into req.body
    // before localFetch. Accept only its raw Buffer and bound it before decode;
    // H3 readRawBody also serializes objects, which is not an allowed fallback.
    // This check cannot bound the preset's earlier allocation: the Pages entry
    // guard must enforce byte/time limits before the preset buffers the body.
    const buffered: unknown = (event.node.req as typeof event.node.req & { body?: unknown }).body
    if (!platform?.bodyUsed || !Buffer.isBuffer(buffered))
      throw createError({ statusCode: 400, statusMessage: 'Engine JSON body required' })
    if (buffered.byteLength > limit)
      throw createError({ statusCode: 413, statusMessage: 'Engine body exceeds byte limit' })
    bytes = buffered
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid engine JSON body' })
  }
}
export function parseEngineJob<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Invalid engine job request' })
  return parsed.data
}
/** Keep infrastructure exceptions and payload-bearing diagnostics out of HTTP. */
export async function engineJobHttp<T>(event: H3Event, run: () => Promise<T>): Promise<T> {
  engineJobPrivateHeaders(event)
  try {
    return await run()
  } catch (error) {
    const status = (error as {
      statusCode?: unknown
    })?.statusCode
    if (typeof status === 'number' && [400, 401, 403, 404, 408, 409, 413, 415, 429].includes(status)) {
      const messages: Record<number, string> = { 400: 'Invalid engine job request', 401: 'Authentication required', 403: 'Engine access denied', 404: 'Engine job not found', 408: 'Engine request timed out', 409: 'Engine job state or source changed', 413: 'Engine body exceeds byte limit', 415: 'Unsupported engine body', 429: 'Engine rate limit exceeded' }
      throw createError({ statusCode: status, statusMessage: messages[status] })
    }
    throw createError({ statusCode: 503, statusMessage: 'Banner engine jobs are unavailable' })
  }
}
