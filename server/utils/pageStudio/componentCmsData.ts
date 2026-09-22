import { z } from 'zod'
import { BuilderArtifactPinSchema } from '~~/shared/pageStudio/cmsManaged'
import { CollectionDefinitionSchema } from '~~/shared/pageStudio/collectionDefinition'
import { CollectionRecordSchema, collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { parseBuilderArtifactJson, projectBuilderActionRecord, verifyBuilderComponentDataBindings } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent, cmsGraphConflict, type CmsGraphPrincipal, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { createCmsGraphStorage } from './cmsGraphStorage'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import { cmsEqual, readCmsConsumerSnapshot, type AcceptedCmsObject } from './cmsVisibility'

export const ComponentCmsDataRequestSchema = z.object({ pin: BuilderArtifactPinSchema.extend({ kind: z.literal('component') }).strict() }).strict()
const bytes = (value: unknown) => new TextEncoder().encode(collectionCanonical(value)).length
const denied = () => cmsGraphConflict('Accepted component data changed or is unavailable. Refresh before trying again.')

/** Authoring read only. Browser pins select among accepted components and grant no authority. */
export async function readAcceptedComponentCmsData(raw: unknown, principal: CmsGraphPrincipal, dependencies: CmsGraphDependencies = {}) {
  const input = ComponentCmsDataRequestSchema.parse(raw)
  const snapshot = await readCmsGraphSnapshot(principal, dependencies)
  if (!snapshot.context.application.manifest.components.some(pin => cmsEqual(pin, input.pin))) throw denied()
  const env = principal.source === 'native-login' ? principal.request.env : principal.env
  const storage = createCmsGraphStorage(env, snapshot)
  const artifactBytes = await storage.readArtifact(input.pin)
  // Discovery selects native metadata only; the shared verifier below proves all semantics.
  const discovery = z.object({ dataBindings: z.array(z.object({ collection: BuilderArtifactPinSchema })).max(16) }).parse(parseBuilderArtifactJson(artifactBytes))
  const wanted = new Set(discovery.dataBindings.map(binding => binding.collection.id))
  const selected = snapshot.schemas.filter(schema => wanted.has(schema.pin.collectionId))
  if (selected.length !== wanted.size) throw denied()
  const cache = new Map<string, Awaited<ReturnType<typeof storage.readObjects>>[number]>()
  let totalBytes = 0
  async function load(objects: AcceptedCmsObject[]) {
    const missing = [...new Map(objects.filter(object => !cache.has(object.id)).map(object => [object.id, object])).values()]
    for (let offset = 0; offset < missing.length; offset += 32) {
      const batch = missing.slice(offset, offset + 32)
      const values = await storage.readObjects(batch.map(object => object.pin))
      for (let i = 0; i < batch.length; i++) {
        const object = batch[i]!, value = values[i]
        if (!value || !cmsEqual(value.pin, object.pin) || value.actorId !== object.actorId || new Date(value.createdAt).toISOString() !== object.createdAt || await collectionDigest(value.body) !== object.pin.sha256 || bytes(value.body) !== object.pin.bytes) throw denied()
        totalBytes += object.pin.bytes
        if (totalBytes > 1_000_000) throw denied()
        if (object.pin.kind === 'schema' && value.schema !== null) throw denied()
        cache.set(object.id, value)
      }
    }
  }
  await load(selected)
  const definitions = selected.map((object) => {
    const definition = CollectionDefinitionSchema.parse(cache.get(object.id)!.body)
    if (!cmsEqual(definition.scope, snapshot.scope) || definition.id !== object.pin.collectionId || definition.version !== object.pin.version) throw denied()
    return definition
  })
  const proof = await verifyBuilderComponentDataBindings({ scope: snapshot.scope, componentPin: input.pin, artifactBytes, definitionBytes: definitions.map(collectionCanonical) })
  const limits = new Map<string, number>()
  for (const binding of proof.bindings) limits.set(binding.collection.id, Math.max(limits.get(binding.collection.id) ?? 0, binding.limit))
  const capture = () => withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: 'business-content' }, async (db) => {
    const result = []
    // One site lock covers all selected collection heads; no private I/O occurs here.
    for (const [collectionId, limit] of limits) {
      const value = await readCmsConsumerSnapshot(db, snapshot.scope, { kind: 'record', collectionId, limit, includeArchived: false })
      if (!cmsEqual(value.context, snapshot.context) || !cmsEqual(value.schemas, snapshot.schemas)) throw denied()
      result.push({ collectionId, objects: value.objects.slice(0, limit) })
    }
    if (!limits.size) {
      const value = await readCmsConsumerSnapshot(db, snapshot.scope)
      if (!cmsEqual(value.context, snapshot.context) || !cmsEqual(value.schemas, snapshot.schemas)) throw denied()
    }
    return result
  }, dependencies)
  const records = await capture()
  if (proof.bindings.reduce((sum, binding) => sum + Math.min(binding.limit, records.find(group => group.collectionId === binding.collection.id)?.objects.length ?? 0), 0) > 100) throw denied()
  const references = records.flatMap(group => group.objects.flatMap(item => item.schema ? [item.schema] : []))
  if (new Set([...selected, ...references].map(object => object.id)).size > 64) throw denied()
  await load([...references, ...records.flatMap(group => group.objects.map(item => item.object))])
  const data: Record<string, { id: string, values: Record<string, string | number | boolean> }[]> = Object.create(null)
  for (const binding of proof.bindings) {
    const definition = definitions.find(item => item.id === binding.collection.id)!
    const group = records.find(item => item.collectionId === binding.collection.id)!
    data[binding.id] = group.objects.slice(0, binding.limit).map(({ object, schema }) => {
      const stored = cache.get(object.id)!
      const record = CollectionRecordSchema.parse(stored.body)
      if (!schema || !cmsEqual(stored.schema, schema.pin) || !cmsEqual(record.scope, snapshot.scope) || record.id !== object.pin.recordId || record.collectionId !== object.pin.collectionId || record.revision !== object.pin.version || record.schemaVersion !== schema.pin.version || record.archived || object.archived !== false) throw denied()
      const storedDefinition = CollectionDefinitionSchema.parse(cache.get(schema.id)!.body)
      if (!cmsEqual(storedDefinition.scope, snapshot.scope) || storedDefinition.id !== record.collectionId || storedDefinition.version !== schema.pin.version) throw denied()
      return { id: record.id, values: projectBuilderActionRecord({ storedDefinition, pinnedDefinition: definition, currentDefinition: definition, values: record.values, fields: binding.fields }) }
    })
  }
  if (bytes(data) > 65_536) throw denied()
  const result = { version: 1 as const, scope: snapshot.scope, application: { id: snapshot.context.application.id, digest: snapshot.context.application.digest }, checkpoint: { id: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest }, componentPin: input.pin, definitions, data }
  if (bytes(result) > 1_048_576) throw denied()
  await assertCmsGraphSnapshotCurrent(snapshot, principal, dependencies)
  if (!cmsEqual(records, await capture())) throw denied()
  return result
}
