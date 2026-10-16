// Pure native inventory planning. These identities grant no storage or editing access.
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from './collectionApi'
import { PageStudioContentScopeSchema } from './businessContent'
import { CmsObjectPinSchema, ReleaseSha256Schema } from './cmsManaged'

export const ManagedTransferAcceptedObjectSchema = z.object({ id: z.uuid(), pin: CmsObjectPinSchema,
  schemaObjectId: z.uuid().nullable(), archived: z.boolean().nullable(), actorId: z.string().min(1), createdAt: z.iso.datetime() }).strict()
const inventorySchema = z.object({ scope: PageStudioContentScopeSchema, freezeDigest: ReleaseSha256Schema, currentContentId: z.uuid().nullable(),
  selections: z.array(z.object({ collectionId: z.string(), objectId: z.uuid() }).strict()).max(128),
  recordHeads: z.array(z.object({ collectionId: z.string(), recordId: z.string(), objectId: z.uuid() }).strict()).max(1000),
  objects: z.array(ManagedTransferAcceptedObjectSchema).max(1000) })
const invalid = () => new Error('Managed transfer copy dependency is unavailable or inconsistent')
const limit = () => new Error('Managed transfer copy dependency limit exceeded')

/** Native accepted history is a CAS snapshot; only this exact dependency closure
 * is copied. Fail on every missing dependency or budget excess, never truncate. */
export function deriveManagedTransferCopyClosure(input: unknown, manifest: unknown) {
  const inventory = inventorySchema.parse(input)
  const objects = new Map(inventory.objects.map(object => [object.id, object]))
  if (objects.size !== inventory.objects.length) throw invalid()
  const selected = new Map<string, z.infer<typeof ManagedTransferAcceptedObjectSchema>>()
  const add = (id: string, kind: 'schema' | 'content' | 'record') => {
    const object = objects.get(id)
    if (!object || object.pin.kind !== kind || object.pin.freezeDigest !== inventory.freezeDigest) throw invalid()
    selected.set(id, object)
    return object
  }
  const content = inventory.currentContentId ? add(inventory.currentContentId, 'content') : null
  for (const schema of inventory.selections) if (add(schema.objectId, 'schema').pin.collectionId !== schema.collectionId) throw invalid()
  for (const head of inventory.recordHeads) {
    const object = add(head.objectId, 'record')
    if (object.pin.collectionId !== head.collectionId || object.pin.recordId !== head.recordId || !object.schemaObjectId) throw invalid()
    if (add(object.schemaObjectId, 'schema').pin.collectionId !== head.collectionId) throw invalid()
  }
  const checkpoint = z.object({ schemaVersion: z.number(), contentBinding: z.object({ scope: PageStudioContentScopeSchema,
    revision: z.number().int().positive(), digest: ReleaseSha256Schema }).passthrough().optional() }).passthrough().parse(manifest)
  const binding = checkpoint.schemaVersion === 2 ? checkpoint.contentBinding : undefined
  if (binding) {
    const candidates = inventory.objects.filter(object => object.pin.kind === 'content' && object.pin.version === binding.revision && object.pin.sha256 === binding.digest)
    if (canonical(binding.scope) !== canonical(inventory.scope) || !content || binding.revision > content.pin.version || candidates.length !== 1) throw invalid()
    add(candidates[0]!.id, 'content')
  }
  const result = [...selected.values()].sort((a, b) => {
    const left = canonical([a.pin.kind, a.pin.collectionId, a.pin.recordId, a.pin.version, a.pin])
    const right = canonical([b.pin.kind, b.pin.collectionId, b.pin.recordId, b.pin.version, b.pin])
    return left < right ? -1 : left > right ? 1 : 0
  })
  const logical = result.map(object => canonical([object.pin.kind, object.pin.collectionId, object.pin.recordId, object.pin.kind === 'record' ? 0 : object.pin.version]))
  if (new Set(logical).size !== result.length) throw invalid()
  if (!result.length || result.length > 128 || result.reduce((sum, object) => sum + object.pin.bytes, 0) > 1_500_000) throw limit()
  return result
}
const identityInput = z.object({ operationId: z.uuid(), intentDigest: ReleaseSha256Schema, sourceDigest: ReleaseSha256Schema,
  destinationExecutionProofDigest: ReleaseSha256Schema, generation: z.uuid(), sourceObjectIds: z.array(z.uuid()).max(128),
  selectedSchemaObjectIds: z.array(z.uuid()).max(128) }).strict()
async function uuidFrom(value: unknown) {
  const hash = await collectionDigest(value)
  const variant = ((Number.parseInt(hash[16]!, 16) & 3) | 8).toString(16)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
export async function deriveManagedTransferGraphIdentities(input: unknown) {
  const value = identityInput.parse(input)
  const { generation, sourceObjectIds, selectedSchemaObjectIds, ...reference } = value
  if (new Set(sourceObjectIds).size !== sourceObjectIds.length || new Set(selectedSchemaObjectIds).size !== selectedSchemaObjectIds.length
    || selectedSchemaObjectIds.some(id => !sourceObjectIds.includes(id))) throw invalid()
  const identity = await collectionDigest({ version: 1, purpose: 'managed-transfer-copy-graph', ...reference })
  const applicationId = await uuidFrom({ identity, purpose: 'application' })
  const objectIds = await Promise.all([...sourceObjectIds].sort().map(async sourceObjectId => ({ sourceObjectId,
    destinationObjectId: await uuidFrom({ identity, purpose: 'object', sourceObjectId }) })))
  if (objectIds.some(item => sourceObjectIds.includes(item.destinationObjectId))
    || new Set([applicationId, ...objectIds.map(item => item.destinationObjectId)]).size !== objectIds.length + 1) throw invalid()
  return { identity, applicationId, checkpointId: `transfer_${identity}`, generation, objectIds,
    schemaObjects: objectIds.filter(item => selectedSchemaObjectIds.includes(item.sourceObjectId)) }
}
