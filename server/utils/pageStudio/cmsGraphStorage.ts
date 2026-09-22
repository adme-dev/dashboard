import { z } from 'zod'
import { BuilderArtifactPinSchema, CmsObjectPinSchema, CmsPreparationSchema, CmsPreparationReceiptSchema, CmsStorageTargetSchema, contentScopeKey, type CmsObjectPin } from '~~/shared/pageStudio/cmsManaged'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { parseBuilderArtifactJson } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { cmsEqual } from './cmsVisibility'
import type { CmsGraphSnapshot } from './cmsGraphCoordinator'
import type { CmsPreparationReader } from './cmsCommits'

const scopedId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const storedObject = z.object({ pin: CmsObjectPinSchema, body: z.unknown(), schema: CmsObjectPinSchema.nullable(), actorId: z.string(), createdAt: z.string(), head: z.boolean() }).strict()
const failed = () => new Error('Managed graph storage bytes unavailable or inconsistent')
async function sha256(raw: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Only server bindings and a native admitted snapshot enter this adapter. */
export function createCmsGraphStorage(env: Record<string, unknown>, snapshot: Pick<CmsGraphSnapshot, 'scope'> & { context: { state: Pick<CmsGraphSnapshot['context']['state'], 'target'> } }) {
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  const service = env.PAGE_STUDIO_CONTENT_ROUTER as Record<string, ((input: unknown) => Promise<unknown>) | undefined> | undefined
  let artifactBytes = 0
  const cache = new Map<string, string>()
  const call = async (name: string, input: unknown) => {
    if (typeof service?.[name] !== 'function') throw failed()
    return await service[name]!(input)
  }
  const assertTarget = async () => {
    const actual = CmsStorageTargetSchema.parse(await call('readManagedCmsTarget', { scope: snapshot.scope }))
    if (!cmsEqual(actual, snapshot.context.state.target)) throw failed()
  }
  const rawObject = async (key: string, max: number, artifact = false) => {
    if (cache.has(key)) return cache.get(key)!
    if (!bucket?.get) throw failed()
    const object = await bucket.get(key)
    if (!object) throw failed()
    if (object.size !== undefined && (object.size < 1 || object.size > max)) {
      await object.body.cancel().catch(() => {})
      throw failed()
    }
    const reader = object.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (artifact) artifactBytes += part.value.byteLength
        if (size > max || artifactBytes > 2_000_000) throw failed()
        chunks.push(part.value)
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    } finally { reader.releaseLock() }
    if (object.size !== undefined && object.size !== size) throw failed()
    const all = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      all.set(chunk, offset)
      offset += chunk.byteLength
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(all)
    const parsed = parseBuilderArtifactJson(raw)
    if (collectionCanonical(parsed) !== raw) throw failed()
    cache.set(key, raw)
    return raw
  }
  const readArtifact = async (input: unknown) => {
    const pin = BuilderArtifactPinSchema.parse(input)
    const key = `builder-artifacts/v1/${await sha256(contentScopeKey(snapshot.scope))}/${pin.kind}/${pin.id}/${pin.version}/${pin.sha256}.json`
    const raw = await rawObject(key, 262_144, true)
    if (await sha256(raw) !== pin.sha256) throw failed()
    return raw
  }
  const readCandidate = async (input: string) => {
    const id = scopedId.parse(input)
    return await rawObject(`builder-candidates/v1/${await sha256(contentScopeKey(snapshot.scope))}/${id}.json`, 262_144)
  }
  const readCheckpoint = async (metadata: { id: string, digest: string, object_key: string }) => {
    if (!bucket?.get) throw failed()
    const checkpoint = await loadPageStudioCheckpoint({ scope: snapshot.scope, bucket, checkpointId: metadata.id, objectKey: metadata.object_key, digests: [metadata.digest] })
    return { id: checkpoint.checkpointId, digest: checkpoint.digest, manifest: checkpoint.manifest }
  }
  const readObjects = async (input: CmsObjectPin[]) => {
    const pins = z.array(CmsObjectPinSchema).max(128).parse(input)
    await assertTarget()
    const result: Array<z.infer<typeof storedObject>> = []
    let total = 0
    for (let offset = 0; offset < pins.length; offset += 32) {
      const batch = pins.slice(offset, offset + 32)
      const objects = z.array(storedObject).max(32).parse(await call('readManagedCmsObjects', { scope: snapshot.scope, pins: batch }))
      if (objects.length !== batch.length) throw failed()
      for (let index = 0; index < objects.length; index++) {
        const object = objects[index]!, raw = collectionCanonical(object.body)
        const bytes = new TextEncoder().encode(raw).byteLength
        total += bytes
        if (total > 1_500_000 || !cmsEqual(object.pin, batch[index]) || bytes !== object.pin.bytes || await collectionDigest(object.body) !== object.pin.sha256) throw failed()
        result.push(object)
      }
    }
    await assertTarget()
    return result
  }
  const readOperation = async (ref: { operationId: string, requestDigest: string, receiptDigest: string }) => {
    scopedId.parse(ref.operationId)
    z.string().regex(/^[a-f0-9]{64}$/).parse(ref.requestDigest)
    z.string().regex(/^[a-f0-9]{64}$/).parse(ref.receiptDigest)
    await assertTarget()
    const operation = z.object({ request: CmsPreparationSchema, receipt: CmsPreparationReceiptSchema }).strict().parse(await call('readManagedCmsOperation', { scope: snapshot.scope, operationId: ref.operationId, requestDigest: ref.requestDigest }))
    if (operation.receipt.digest !== ref.receiptDigest || operation.receipt.requestDigest !== ref.requestDigest) throw failed()
    const objects = await readObjects(operation.receipt.items)
    if (objects.length !== operation.request.items.length || objects.some((object, index) => {
      const item = operation.request.items[index]!
      return item.kind !== 'schema' || !cmsEqual(object.body, item.body)
        || object.actorId !== operation.request.actor.userId
        || object.createdAt !== operation.receipt.createdAt
        || object.schema !== null || object.head !== false
    })) throw failed()
    const freeze = await call('readManagedCmsFreeze', { scope: snapshot.scope })
    await assertTarget()
    return { ...operation, freeze, schemas: [] }
  }
  const readPreparation: CmsPreparationReader = input => readOperation({ operationId: input.operationId, requestDigest: input.requestDigest, receiptDigest: input.receiptDigest })
  return { readArtifact, readCandidate, readCheckpoint, readObjects, readOperation, readPreparation }
}
