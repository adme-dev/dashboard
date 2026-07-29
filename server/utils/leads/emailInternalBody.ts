import { createError, getHeader, type H3Event } from 'h3'

export const EMAIL_INTERNAL_JSON_LIMITS = {
  policy: 1_024,
  stageConfirmation: 2_048,
  telemetry: 16 * 1_024,
  stage: 64 * 1_024,
  ingest: 2 * 1024 * 1_024
} as const

function fail(statusCode: 400 | 413, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function bytesOf(chunk: unknown): Uint8Array | null {
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  return null
}

/**
 * Reads the exact UTF-8 bytes used for HMAC verification while enforcing a
 * hard streaming cap. Content-Length is only an early rejection hint; the
 * observed byte count remains authoritative for chunked requests.
 */
export async function readBoundedEmailInternalJson(
  event: H3Event,
  maxBytes: number,
  statusMessage: string
): Promise<string> {
  const declaredLength = getHeader(event, 'content-length')
  if (
    declaredLength
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > maxBytes
  ) {
    fail(413, statusMessage)
  }

  const request = event.node.req as AsyncIterable<unknown>
  if (
    !request
    || typeof request[Symbol.asyncIterator] !== 'function'
  ) {
    fail(400, statusMessage)
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  for await (const value of request) {
    const chunk = bytesOf(value)
    if (!chunk) fail(400, statusMessage)
    totalBytes += chunk.byteLength
    if (totalBytes > maxBytes) fail(413, statusMessage)
    chunks.push(chunk)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    fail(400, statusMessage)
  }
}
