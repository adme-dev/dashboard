import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { ENGINE_JOB_LIMITS } from '../../../shared/bannerEngineJobs'

/** Dedicated private binding only. No public-asset or filesystem fallback. */
export interface EngineJobBucket {
  get(key: string): Promise<{ size: number, body?: ReadableStream<Uint8Array> } | null>
  put(key: string, bytes: Uint8Array, options: {
    onlyIf: { etagDoesNotMatch: '*' }
    httpMetadata: { contentType: string, cacheControl: string }
  }): Promise<unknown | null>
}
export interface EngineJobStorage {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>
  get(key: string, descriptor: { bytes: number, sha256: string }): Promise<Buffer>
}
export const engineJobSha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

/** Bound actual streamed bytes before JSON parsing/decoding, regardless of headers. */
export async function readEngineJobStream(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ENGINE_JOB_LIMITS.jsonBytes) throw new Error('Invalid engine stream limit')
  const reader = stream.getReader()
  const buffer = Buffer.allocUnsafe(limit)
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(createError({ statusCode: 408, statusMessage: 'Engine body read timed out' })), 30000)
    timer.unref?.()
  })
  const read = async () => {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > limit - length) {
        throw createError({ statusCode: 413, statusMessage: 'Engine body exceeds byte limit' })
      }
      buffer.set(chunk.value, length)
      length += chunk.value.byteLength
    }
    return buffer.subarray(0, length)
  }
  try {
    // One timer race per stream, not per chunk: tiny chunks cannot accumulate
    // unbounded promise handlers on a still-pending deadline promise.
    return await Promise.race([read(), timeout])
  } catch (error) {
    // Do not wait for a hostile or stalled producer to acknowledge cancellation.
    void reader.cancel().catch(() => undefined)
    throw error
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

export function createEngineJobStorage(bucket: EngineJobBucket): EngineJobStorage {
  return {
    async put(key, bytes, mimeType) {
      if (!key.startsWith('engine-jobs/') || bytes.byteLength < 1 || bytes.byteLength > ENGINE_JOB_LIMITS.inputBytes) throw new Error('Invalid private engine artifact')
      // Conditional creation is mandatory. A collision or uncertain write is held;
      // never overwrite, retry or delete potentially accepted bytes.
      const result = await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' }
      })
      if (!result) throw createError({ statusCode: 409, statusMessage: 'Private engine artifact already exists' })
    },
    async get(key, descriptor) {
      if (!key.startsWith('engine-jobs/') || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > ENGINE_JOB_LIMITS.inputBytes) throw new Error('Invalid private engine artifact')
      const object = await bucket.get(key)
      if (!object?.body || typeof object.body.getReader !== 'function' || object.size !== descriptor.bytes) {
        if (object?.body) void object.body.cancel().catch(() => undefined)
        throw createError({ statusCode: 409, statusMessage: 'Private engine artifact unavailable' })
      }
      const bytes = await readEngineJobStream(object.body, descriptor.bytes)
      if (bytes.length !== descriptor.bytes || engineJobSha256(bytes) !== descriptor.sha256) throw createError({ statusCode: 409, statusMessage: 'Private engine artifact integrity mismatch' })
      return bytes
    }
  }
}
