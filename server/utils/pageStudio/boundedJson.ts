import { createError, getHeader, getRequestWebStream, type H3Event } from 'h3'

// Enforce observed bytes, including chunked requests; Content-Length is only a hint.
export async function readPageStudioJson(event: H3Event, limit: number, messages: readonly [string, string, string, string, string]): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(event, 'content-type') ?? '')) {
    throw createError({ statusCode: 415, statusMessage: messages[0] })
  }
  const oversized = () => createError({ statusCode: 413, statusMessage: messages[1] })
  if (Number(getHeader(event, 'content-length')) > limit) throw oversized()
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: messages[2] })
  const reader = stream.getReader()
  const body = new Uint8Array(limit)
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      if (!(bytes instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: messages[3] })
      if (size + bytes.byteLength > limit) {
        await reader.cancel('Content body limit exceeded')
        throw oversized()
      }
      body.set(bytes, size)
      size += bytes.byteLength
    }
  } finally { reader.releaseLock() }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, size)))
  } catch {
    throw createError({ statusCode: 400, statusMessage: messages[4] })
  }
}
