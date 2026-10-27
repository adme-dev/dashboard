import { createError, type H3Event } from 'h3'

const UPLOAD_PATH = '/api/agency/banner-studio/dissect/upload'
const BODY_BYTES = 10 * 1024 * 1024 + 64 * 1024
const BODY_TIMEOUT_MS = 30000
const MAX_CHUNKS = 65536
const messages: Record<number, string> = {
  400: 'Invalid dissection upload request',
  408: 'Dissection upload timed out',
  413: 'Dissection upload exceeds transport limit',
  415: 'Unsupported dissection upload encoding'
}

function uploadPath(path: string): boolean {
  // H3 decodes ASCII before matching, including %3F before query stripping.
  // Recognize aliases only to reject them; never normalize a forwarded URL.
  return path.replace(/%([\da-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replaceAll('\\', '/').replace(/\/{2,}/g, '/').toLowerCase()
    .split('?')[0]!.replace(/\/+$/, '') === UPLOAD_PATH
}

function checkHeaders(headers: { get(name: string): string | null }) {
  const encoding = headers.get('content-encoding')
  if (encoding && encoding !== 'identity') throw 415
  const declared = headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_BYTES)) throw 413
}

function status(error: unknown): number {
  return typeof error === 'number' && error in messages ? error : 400
}

async function boundedBytes(body: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  try {
    reader = body.getReader()
    const bytes = new Uint8Array(BODY_BYTES)
    let length = 0
    let chunks = 0
    const read = async () => {
      while (!stopped) {
        const chunk = await reader!.read()
        if (stopped) throw 400
        if (chunk.done) return bytes.subarray(0, length)
        if (++chunks > MAX_CHUNKS || !(chunk.value instanceof Uint8Array) || chunk.value.byteLength > BODY_BYTES - length) throw 413
        bytes.set(chunk.value, length)
        length += chunk.value.byteLength
      }
      throw 400
    }
    const deadline = new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(408), BODY_TIMEOUT_MS)
    })
    return await Promise.race([read(), deadline])
  } catch (error) {
    stopped = true
    // An adversarial producer may never acknowledge cancellation.
    void reader?.cancel().catch(() => undefined)
    throw status(error)
  } finally {
    clearTimeout(timer)
    reader?.releaseLock()
  }
}

/** Platform fetch entry only. Authentication and multipart field policy are route-owned. */
export async function guardBannerDissectionPagesRequest(request: Request): Promise<Request | Response> {
  const path = new URL(request.url).pathname
  if (!uploadPath(path)) return request
  try {
    if (path !== UPLOAD_PATH) throw 400
    checkHeaders(request.headers)
    if (!request.body) return request
    const body = await boundedBytes(request.body)
    // The checked transform separately pins platform context to the native Request.
    return new Request(request, { body })
  } catch (error) {
    const code = status(error)
    return new Response(JSON.stringify({ statusCode: code, statusMessage: messages[code] }), {
      status: code,
      headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie, Authorization'
      }
    })
  }
}

// Unlike H3's getRequestWebStream, this bridge pauses Node between reads and
// removes listeners on cancellation. Do not destroy the socket before H3 sends
// its rejection response. It will be closed after that response.
function localBody(event: H3Event): ReadableStream<Uint8Array> {
  const request = event.node.req
  let cleanup = () => {}
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const data = (chunk: Uint8Array) => { request.pause(); controller.enqueue(chunk) }
      const end = () => { cleanup(); controller.close() }
      const error = () => { cleanup(); controller.error(400) }
      cleanup = () => {
        request.off('data', data).off('end', end).off('error', error).off('aborted', error)
      }
      request.on('data', data).once('end', end).once('error', error).once('aborted', error)
      request.pause()
      if (request.readableEnded) end()
      else if (request.destroyed) error()
    },
    pull() { request.resume() },
    cancel() { request.pause(); cleanup(); event.node.res.shouldKeepAlive = false }
  }, { highWaterMark: 0 })
}

const boundedEvents = new WeakMap<H3Event, Promise<void>>()

/** Call after auth, before readMultipartFormData. Concurrent/repeated calls share one read. */
export function ensureBoundedDissectionUploadBody(event: H3Event): Promise<void> {
  const existing = boundedEvents.get(event)
  if (existing) return existing
  const pending = (async () => {
    try {
      // Node's raw URL retains aliases which H3's event.path may have decoded.
      const path = (event.node.req.originalUrl || event.node.req.url || '').split('?')[0]!
      if (path !== UPLOAD_PATH) throw 400
      checkHeaders(event.headers)
      const request = event.node.req as typeof event.node.req & {
        body?: unknown, rawBody?: unknown, [key: symbol]: unknown
      }
      const rawEvent = event as unknown as { _requestBody?: unknown }
      const cached = rawEvent._requestBody ?? request[Symbol.for('h3RawBody')] ?? request.rawBody ?? request.body
      let bytes: Uint8Array
      if (cached !== undefined) {
        // Pages supplies a Buffer after the entry guard. Never invoke an
        // arbitrary cached promise/stream that might have already started reads.
        if (!(cached instanceof Uint8Array)) throw 400
        if (cached.byteLength > BODY_BYTES) throw 413
        bytes = cached
      } else {
        bytes = await boundedBytes(event.web?.request?.body ?? localBody(event))
      }
      // Installed H3 readRawBody prioritizes _requestBody over event.web.request.
      // Populate it with bounded bytes so multipart parsing never reads twice.
      rawEvent._requestBody = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    } catch (error) {
      event.node.req.pause()
      event.node.res.shouldKeepAlive = false
      const code = status(error)
      throw createError({ statusCode: code, statusMessage: messages[code] })
    }
  })()
  boundedEvents.set(event, pending)
  return pending
}
