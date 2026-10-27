import { timingSafeEqual } from 'node:crypto'

// These are entry limits, before Nitro's Pages preset calls arrayBuffer(). Keep
// them aligned with ENGINE_JOB_LIMITS; route/schema limits remain independent.
const BODY_BYTES = 24 * 1024 * 1024
const CANCEL_BYTES = 64 * 1024
const BODY_TIMEOUT_MS = 30000
const MAX_CHUNKS = 65536
const USER_PATH = '/api/agency/banner-studio/engine-jobs'
const SERVICE_PATH = '/api/internal/banner-engine'

function reject(status: number): Response {
  const messages: Record<number, string> = {
    400: 'Invalid engine job request', 401: 'Authentication required',
    403: 'Engine access denied', 408: 'Engine request timed out',
    413: 'Engine body exceeds byte limit', 415: 'Unsupported engine body',
    503: 'Banner engine jobs are unavailable'
  }
  return new Response(JSON.stringify({ statusCode: status, statusMessage: messages[status] }), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie, Authorization'
    }
  })
}

function enginePath(path: string): { internal: boolean, cancel: boolean, ambiguous: boolean } | undefined {
  // H3 decodes percent escapes before routing. Decode ASCII conservatively,
  // including separators H3 currently leaves encoded; reject aliases rather
  // than forwarding an ambiguous spelling to a later router. Malformed UTF-8
  // cannot hide a valid ASCII engine prefix. No normalization changes the URL.
  let normalized = path.replace(/%([\da-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replaceAll('\\', '/').replace(/\/{2,}/g, '/').toLowerCase()
  // H3's router strips the query AFTER its app has decoded the path, so %3F
  // can terminate a routed path even though URL.pathname still includes it.
  normalized = normalized.split('?')[0]!
  normalized = normalized.replace(/\/+$/, '')
  const under = (prefix: string) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  const internal = under(SERVICE_PATH)
  if (!internal && !under(USER_PATH)) return undefined
  return {
    internal,
    cancel: !internal && normalized.endsWith('/cancel'),
    ambiguous: path.replace(/\/$/, '') !== normalized || path.includes('%')
  }
}

/** Only the platform fetch entry calls this; never accept env or URL from headers. */
export async function guardBannerEnginePagesRequest(request: Request, env: Record<string, unknown>): Promise<Request | Response> {
  const url = new URL(request.url)
  const route = enginePath(url.pathname)
  if (!route) return request
  // Do not touch the body, acquire its reader, or fall back to process.env when
  // disabled. The actual deployment binding must explicitly opt into this API.
  if (env?.BANNER_ENGINE_ENABLED !== 'true') return reject(503)
  if (route.ambiguous) return reject(400)
  if (route.internal) {
    const token = env.BANNER_ENGINE_SERVICE_TOKEN
    if (typeof token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(token)) return reject(503)
    // A Pages entry has no trusted loopback socket; local-loopback exceptions
    // belong exclusively to the local Node HTTP bridge, never forwarded headers.
    if (url.protocol !== 'https:') return reject(403)
    const supplied = Buffer.from(request.headers.get('authorization') ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reject(401)
  }
  const encoding = request.headers.get('content-encoding')
  if (encoding && encoding !== 'identity') return reject(415)
  const limit = route.cancel ? CANCEL_BYTES : BODY_BYTES
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return reject(413)
  if (!request.body) return request

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    reader = request.body.getReader()
    // One fixed allocation, no per-chunk retention or per-chunk deadline races.
    const bytes = new Uint8Array(limit)
    let length = 0
    let chunks = 0
    const read = async () => {
      while (true) {
        const chunk = await reader!.read()
        if (chunk.done) return bytes.subarray(0, length)
        if (++chunks > MAX_CHUNKS || !(chunk.value instanceof Uint8Array) || chunk.value.byteLength > limit - length) {
          throw 413
        }
        bytes.set(chunk.value, length)
        length += chunk.value.byteLength
      }
    }
    const deadline = new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(408), BODY_TIMEOUT_MS)
    })
    const body = await Promise.race([read(), deadline])
    // The preset receives only bounded bytes. Its platform context is separately
    // pinned to the original Request by the checked build transform.
    return new Request(request, { body })
  } catch (error) {
    // Never wait for an adversarial producer's cancellation acknowledgement.
    void reader?.cancel().catch(() => undefined)
    return reject(error === 413 || error === 408 ? error : 400)
  } finally {
    clearTimeout(timer)
    reader?.releaseLock()
  }
}
