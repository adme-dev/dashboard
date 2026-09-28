import {
  createNativeAstroRuntimeFeatureReference,
  verifyNativeAstroRuntimeFeatureRecovery,
  type NativeAstroRuntimeRelease
} from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'

interface RecoveryObject { size?: number, body: ReadableStream<Uint8Array> }
export interface RuntimeFeatureRecoveryBucket {
  get(key: string): Promise<RecoveryObject | null>
  put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>
}

/** Bound actual bytes, not just object metadata. Stored recovery is private and
 * must remain canonical; invalid existing content is never overwritten. */
async function readExact(object: RecoveryObject, expected: number, bounded: <T>(operation: () => Promise<T>) => Promise<T>): Promise<string> {
  if (object.size !== undefined && object.size !== expected) {
    void object.body.cancel().catch(() => {})
    throw new Error('Runtime feature recovery size mismatch')
  }
  const reader = object.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let text = '', length = 0
  try {
    for (;;) {
      const part = await bounded(() => reader.read())
      if (part.done) break
      length += part.value.byteLength
      if (length > expected) throw new Error('Runtime feature recovery exceeds byte limit')
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    if (length !== expected) throw new Error('Runtime feature recovery truncated')
    return text
  } catch (error) {
    void reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
}

/** Retention only, not approval or activation. The native preparation coordinator
 * fences current publisher/approval authority before and after this I/O.
 * There is no HTTP entry point and callers cannot select an object key. */
export async function retainRuntimeFeatureRecovery(
  release: NativeAstroRuntimeRelease,
  bundle: unknown,
  bucket: RuntimeFeatureRecoveryBucket,
  signal?: AbortSignal
) {
  // Freeze inputs before I/O so the bytes retained are exactly those verified.
  const retainedRelease = structuredClone(release)
  const body = collectionCanonical(bundle)
  const reference = await createNativeAstroRuntimeFeatureReference(retainedRelease, JSON.parse(body))
  const controller = new AbortController()
  const abort = () => controller.abort(new Error('Runtime feature recovery cancelled or timed out'))
  const timer = setTimeout(abort, 10_000)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const cancelled = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) reject(controller.signal.reason)
    else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
  })
  // Install a rejection handler even if cancellation precedes the first I/O.
  void cancelled.catch(() => {})
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    controller.signal.throwIfAborted()
    return await Promise.race([operation(), cancelled])
  }
  try {
    let stored = await bounded(() => bucket.get(reference.recovery.key))
    if (!stored) {
      await bounded(() => bucket.put(reference.recovery.key, new TextEncoder().encode(body), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' }
      }))
      stored = await bounded(() => bucket.get(reference.recovery.key))
    }
    if (!stored) throw new Error('Retained runtime feature recovery is unavailable')
    const retainedObject = stored
    await bounded(async () => await verifyNativeAstroRuntimeFeatureRecovery(reference, retainedRelease, await readExact(retainedObject, reference.recovery.bytes, bounded)))
    return reference
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
