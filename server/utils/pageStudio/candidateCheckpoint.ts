import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioCheckpointInput } from './controlStore'

const maximumBytes = 8 * 1024 * 1024
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const inputSchema = z.object({
  checkpointId: id,
  scope: z.object({ tenantId: id, clientId: id, siteId: id }).strict(),
  userId: id,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  manifest: z.unknown()
}).strict()
const envelopeSchema = inputSchema.extend({ schemaVersion: z.literal(1), createdAt: z.iso.datetime() }).strict()
export interface CandidateCheckpointBucket {
  get(key: string): Promise<{ size: number, etag: string, body: ReadableStream<Uint8Array> } | null>
  put(key: string, value: string, options: { onlyIf: { etagDoesNotMatch: string }, httpMetadata: { contentType: string } }): Promise<{ etag: string } | null>
}
async function readBytes(object: NonNullable<Awaited<ReturnType<CandidateCheckpointBucket['get']>>>) {
  if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > maximumBytes) {
    await object.body.cancel().catch(() => {})
    throw new Error('Feature checkpoint byte limit')
  }
  const reader = object.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > object.size || size > maximumBytes) throw new Error('Feature checkpoint byte limit')
      chunks.push(part.value)
    }
    if (size !== object.size) throw new Error('Feature checkpoint byte mismatch')
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
/** Private checkpoint bytes only; native graph acceptance separately grants visibility.
 * All I/O occurs before the final native transaction. Exact retries reuse the first
 * timestamp/etag, including conditional races and an unknown storage response. */
export async function persistCandidateCheckpoint(raw: unknown, bucket: CandidateCheckpointBucket): Promise<PageStudioCheckpointInput> {
  const input = inputSchema.parse(raw)
  // Freeze a JSON snapshot before the first async read or storage operation.
  const manifestBytes = collectionCanonical(input.manifest)
  if (new TextEncoder().encode(manifestBytes).byteLength > maximumBytes) throw new Error('Feature checkpoint byte limit')
  input.manifest = JSON.parse(manifestBytes)
  if (await collectionDigest(input.manifest) !== input.digest || (input.manifest as { id?: unknown })?.id !== input.scope.siteId) throw new Error('Feature checkpoint manifest digest mismatch')
  const objectKey = `tenants/${input.scope.tenantId}/clients/${input.scope.clientId}/sites/${input.scope.siteId}/checkpoints/${input.checkpointId}.json`
  const metadata = (createdAt: string, etag: string) => {
    if (!etag) throw new Error('Feature checkpoint storage acknowledgement unavailable')
    const { manifest: _manifest, ...rest } = input
    return { ...rest, createdAt, etag, objectKey }
  }
  const existing = async () => {
    const object = await bucket.get(objectKey)
    if (!object) return null
    const bytes = await readBytes(object)
    const envelope = envelopeSchema.parse(JSON.parse(bytes))
    const { createdAt, schemaVersion: _version, ...body } = envelope
    if (collectionCanonical(body) !== collectionCanonical(input) || collectionCanonical(envelope) !== bytes) throw new Error('Feature checkpoint identity conflict')
    return metadata(createdAt, object.etag)
  }
  const retained = await existing()
  if (retained) return retained
  const createdAt = new Date().toISOString()
  const envelope = collectionCanonical({ ...input, schemaVersion: 1, createdAt })
  if (new TextEncoder().encode(envelope).byteLength > maximumBytes) throw new Error('Feature checkpoint byte limit')
  let stored: { etag: string } | null
  try {
    stored = await bucket.put(objectKey, envelope, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } })
  } catch (error) {
    const recovered = await existing()
    if (recovered) return recovered
    throw error
  }
  if (stored) return metadata(createdAt, stored.etag)
  const concurrent = await existing()
  if (!concurrent) throw new Error('Feature checkpoint conditional write unresolved')
  return concurrent
}
