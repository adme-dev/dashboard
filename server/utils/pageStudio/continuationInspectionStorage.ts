// Private immutable bytes, not native evidence or permission. The controller must
// validate the full inspection contract and fresh authority around storage I/O.
import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

const Id = z.uuid(), Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Time = z.iso.datetime({ precision: 3, offset: false })
const Scope = z.object({ tenantId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/), clientId: Id, siteId: Id }).strict()
const Reference = z.object({ scope: Scope, operationId: Id, invocationId: Id, requestDigest: Digest, expiresAt: Time }).strict()
const Envelope = Reference.extend({ schemaVersion: z.literal(1), request: z.unknown() }).strict()
const Input = Reference.extend({ request: z.unknown() }).strict()
const Identity = z.object({ formatVersion: z.literal(1), purpose: z.literal('recovery-continuation-inspection'), operationId: Id, invocationId: Id }).passthrough()
export const CONTINUATION_INSPECTION_REQUEST_BYTES = 16_777_216
const storedLimit = CONTINUATION_INSPECTION_REQUEST_BYTES + 2048
export interface ContinuationInspectionReadBucket {
  get(key: string): Promise<{ size: number, body: ReadableStream<Uint8Array> } | null>
}
export interface ContinuationInspectionBucket extends ContinuationInspectionReadBucket {
  put(key: string, value: string, options: { onlyIf: { etagDoesNotMatch: string }, httpMetadata: { contentType: string } }): Promise<{ etag: string } | null>
}
function key(reference: z.infer<typeof Reference>) {
  const { tenantId, clientId, siteId } = reference.scope
  return `private/page-studio/transfer-inspections/${tenantId}/${clientId}/${siteId}/${reference.operationId}/${reference.invocationId}.json`
}
function fresh(expiresAt: string) {
  const remaining = Date.parse(expiresAt) - Date.now()
  if (remaining <= 0 || remaining > 300000) throw new Error('Continuation inspection snapshot expired or exceeds its lifetime')
}
function identity(request: unknown, reference: z.infer<typeof Reference>) {
  const value = Identity.parse(request)
  if (value.operationId !== reference.operationId || value.invocationId !== reference.invocationId) throw new Error('Continuation inspection identity mismatch')
}
const deadlineFor = (expiresAt: string) => Math.min(Date.parse(expiresAt), Date.now() + 8000)
async function bounded<T>(work: () => Promise<T>, deadline: number, cleanup: { timeout?: () => void, late?: (value: T) => void } = {}) {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('Continuation inspection storage deadline')
  let timer: ReturnType<typeof setTimeout> | undefined, expired = false
  const pending = work()
  if (cleanup.late) void pending.then((value) => {
    if (expired) cleanup.late!(value)
  }).catch(() => {})
  try {
    const result = await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true
        cleanup.timeout?.()
        reject(new Error('Continuation inspection storage deadline'))
      }, remaining)
    })])
    if (Date.now() >= deadline) {
      cleanup.late?.(result)
      throw new Error('Continuation inspection storage deadline')
    }
    return result
  } finally { if (timer) clearTimeout(timer) }
}
async function readText(object: NonNullable<Awaited<ReturnType<ContinuationInspectionReadBucket['get']>>>, deadline: number) {
  if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > storedLimit) {
    void object.body.cancel().catch(() => {})
    throw new Error('Continuation inspection byte limit')
  }
  const reader = object.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), parts: string[] = []
  let length = 0
  try {
    for (;;) {
      const part = await bounded(() => reader.read(), deadline, { timeout: () => {
        void reader.cancel().catch(() => {})
      } })
      if (part.done) break
      length += part.value.byteLength
      if (length > object.size || length > storedLimit) throw new Error('Continuation inspection byte limit')
      parts.push(decoder.decode(part.value, { stream: true }))
    }
    if (length !== object.size) throw new Error('Continuation inspection byte mismatch')
    parts.push(decoder.decode())
    return parts.join('')
  } catch (error) {
    void reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
}
async function retained(reference: z.infer<typeof Reference>, bucket: ContinuationInspectionReadBucket, deadline: number) {
  fresh(reference.expiresAt)
  const object = await bounded(() => bucket.get(key(reference)), deadline, { late: (value) => {
    void value?.body.cancel().catch(() => {})
  } })
  if (!object) return null
  const bytes = await readText(object, deadline), parsed = Envelope.parse(JSON.parse(bytes))
  const { request, schemaVersion: _version, ...stored } = parsed
  identity(request, reference)
  if (collectionCanonical(stored) !== collectionCanonical(reference) || collectionCanonical(parsed) !== bytes
    || new TextEncoder().encode(collectionCanonical(request)).byteLength > CONTINUATION_INSPECTION_REQUEST_BYTES
    || await collectionDigest(request) !== reference.requestDigest) throw new Error('Continuation inspection snapshot conflict')
  fresh(reference.expiresAt)
  if (Date.now() >= deadline) throw new Error('Continuation inspection storage deadline')
  return { request }
}
export async function readContinuationInspectionSnapshot(input: unknown, bucket: ContinuationInspectionReadBucket): Promise<unknown> {
  const reference = Reference.parse(input)
  const result = await retained(reference, { get: bucket.get.bind(bucket) }, deadlineFor(reference.expiresAt))
  if (!result) throw new Error('Continuation inspection snapshot unavailable')
  return result.request
}
/** Use only after genuine authority and full native wire validation. No SQL locks
 * should span this I/O. Exact retries keep the first bytes and expiry; an unknown
 * write reply is resolved by readback, never a blind second write. */
export async function persistContinuationInspectionSnapshot(raw: unknown, bucketInput: ContinuationInspectionBucket) {
  const input = Input.parse(raw), { request, ...reference } = input
  const deadline = deadlineFor(reference.expiresAt)
  const bucket = { get: bucketInput.get.bind(bucketInput), put: bucketInput.put.bind(bucketInput) }
  const requestBytes = collectionCanonical(request)
  if (new TextEncoder().encode(requestBytes).byteLength > CONTINUATION_INSPECTION_REQUEST_BYTES) throw new Error('Continuation inspection byte limit')
  const snapshot = JSON.parse(requestBytes)
  identity(snapshot, reference)
  fresh(reference.expiresAt)
  if (await collectionDigest(snapshot) !== reference.requestDigest) throw new Error('Continuation inspection request digest mismatch')
  const bytes = collectionCanonical({ ...reference, schemaVersion: 1, request: snapshot })
  if (new TextEncoder().encode(bytes).byteLength > storedLimit) throw new Error('Continuation inspection byte limit')
  if (await retained(reference, bucket, deadline)) return reference
  fresh(reference.expiresAt)
  try {
    await bounded(() => bucket.put(key(reference), bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } }), deadline)
  } catch (error) {
    if (await retained(reference, bucket, deadline)) return reference
    throw error
  }
  if (!await retained(reference, bucket, deadline)) throw new Error('Continuation inspection conditional write unresolved')
  return reference
}
