import { z } from 'zod'
import { BuilderArtifactPinSchema } from '~~/shared/pageStudio/cmsManaged'
import { CollectionDefinitionSchema } from '~~/shared/pageStudio/collectionDefinition'
import { CollectionRecordSchema, collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { projectBuilderActionRecord, verifyBuilderComponentDataBindings, verifyBuilderReleaseRecovery, type BuilderGraphJson } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { createCmsGraphStorage } from './cmsGraphStorage'
import { cmsEqual, readCmsConsumerSnapshot, type AcceptedCmsObject } from './cmsVisibility'
import { readPublishedFeatureSnapshot, withPublishedFeatureAuthority, publishedFeatureDenied, type PublishedFeatureSnapshot } from './publishedFeatureAuthority'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'

const jsonObject = (value: BuilderGraphJson) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw publishedFeatureDenied()
  return value
}
const jsonArray = (value: BuilderGraphJson) => {
  if (!Array.isArray(value)) throw publishedFeatureDenied()
  return value
}
const size = (value: unknown) => new TextEncoder().encode(collectionCanonical(value)).length
/** Actual bounded immutable recovery bytes. Never accepts a caller-selected R2 key. */
export async function readPublishedFeatureRecovery(snapshot: PublishedFeatureSnapshot, env: Record<string, unknown>) {
  const expectedKey = `builder-recovery/v1/${await collectionDigest(snapshot.contentScope)}/${snapshot.request.versionDigest}/${snapshot.request.sealDigest}.json`
  if (expectedKey !== snapshot.seal.recovery.key) throw publishedFeatureDenied()
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as { get(key: string): Promise<{ size?: number, body: ReadableStream<Uint8Array> } | null> } | undefined
  const object = await bucket?.get(expectedKey)
  if (!object) throw publishedFeatureDenied()
  const max = snapshot.seal.recovery.bytes
  if (object.size !== undefined && object.size !== max) {
    await object.body.cancel().catch(() => {})
    throw publishedFeatureDenied()
  }
  const reader = object.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = '', bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > max) throw publishedFeatureDenied()
      raw += decoder.decode(part.value, { stream: true })
    }
    raw += decoder.decode()
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  if (bytes !== max) throw publishedFeatureDenied()
  const verified = await verifyBuilderReleaseRecovery(JSON.parse(raw))
  if (verified.digest !== snapshot.request.sealDigest || collectionCanonical(verified.bundle) !== raw) throw publishedFeatureDenied()
  const bundle = jsonObject(verified.bundle), checkpoint = jsonObject(bundle.checkpoint!)
  if (
    !cmsEqual(bundle.contentScope, snapshot.contentScope)
    || !cmsEqual(bundle.application, snapshot.seal.application)
    || checkpoint.id !== snapshot.seal.checkpoint
    || checkpoint.sha256 !== snapshot.request.versionDigest
    || bundle.generation !== snapshot.seal.generation
    || !cmsEqual(bundle.target, snapshot.seal.target)
    || bundle.freezeDigest !== snapshot.seal.freezeDigest
    || bundle.runtimeDigest !== snapshot.seal.runtimeDigest
  ) throw publishedFeatureDenied()
  return { ...verified, bundle, checkpoint: jsonObject(verified.checkpoint) }
}
/** The host-configured published release is the principal. Current record heads never come from
 * the sealed bundle and publication never impersonates the original publisher. */
export async function readPublishedFeaturePage(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const snapshot = await readPublishedFeatureSnapshot(raw, env, dependencies)
  const recovered = await readPublishedFeatureRecovery(snapshot, env)
  const pages = jsonArray(recovered.checkpoint.pages!).map(jsonObject)
  const page = pages.find(item => item.route === snapshot.request.pageRoute && item.visibility === 'public')
  if (!page) throw publishedFeatureDenied()
  const instances = recovered.instances.filter(instance => instance.pageId === page.id)
  if (instances.length > 32) throw publishedFeatureDenied()
  const selected = [...new Map(instances.map(instance => [collectionCanonical(instance.pin), instance.pin])).values()]
  const artifacts = jsonArray(recovered.bundle.artifacts!).map(jsonObject)
  const pinnedDefinitions = jsonArray(recovered.bundle.schemas!).map(item => CollectionDefinitionSchema.parse(JSON.parse(String(jsonObject(item).bytes))))
  const components = []
  for (const pin of selected) {
    const entry = artifacts.find(entry => cmsEqual(entry.pin, pin))
    if (!entry || typeof entry.bytes !== 'string') throw publishedFeatureDenied()
    // Shared recovery already verified exact component bytes;
    // discovery only
    // chooses the pinned definitions needed by the existing binding verifier.
    const artifact = jsonObject(JSON.parse(entry.bytes))
    const discovery = z.object({ dataBindings: z.array(z.object({ collection: BuilderArtifactPinSchema })).max(16) }).parse(artifact)
    const wanted = new Set(discovery.dataBindings.map(binding => binding.collection.id))
    const definitions = pinnedDefinitions.filter(definition => wanted.has(definition.id))
    const proof = await verifyBuilderComponentDataBindings({ scope: snapshot.contentScope, componentPin: pin, artifactBytes: entry.bytes, definitionBytes: definitions.map(collectionCanonical) })
    components.push({ pin, artifact, definitions, bindings: proof.bindings })
  }
  const limits = new Map<string, number>()
  for (const component of components) for (const binding of component.bindings) limits.set(binding.collection.id, Math.max(limits.get(binding.collection.id) ?? 0, binding.limit))
  const capture = () => withPublishedFeatureAuthority(snapshot.request, env, snapshot, async (db) => {
    const current = await readCmsConsumerSnapshot(db, snapshot.contentScope)
    if (!cmsEqual(current.context, snapshot.context)) throw publishedFeatureDenied()
    const schemas = current.schemas.filter(schema => limits.has(schema.pin.collectionId))
    if (schemas.length !== limits.size) throw publishedFeatureDenied()
    const groups = []
    for (const [collectionId, limit] of limits) {
      const records = await readCmsConsumerSnapshot(db, snapshot.contentScope, { kind: 'record', collectionId, limit, includeArchived: false })
      if (!cmsEqual(records.context, current.context) || !cmsEqual(records.schemas, current.schemas)) throw publishedFeatureDenied()
      groups.push({ collectionId, objects: records.objects.slice(0, limit) })
    }
    return { schemas, groups }
  }, dependencies)
  const current = await capture()
  const rows = components.reduce((sum, component) => sum + component.bindings.reduce((count, binding) => count + Math.min(binding.limit, current.groups.find(group => group.collectionId === binding.collection.id)?.objects.length ?? 0), 0), 0)
  if (rows > 100) throw publishedFeatureDenied()
  const references = current.groups.flatMap(group => group.objects.flatMap(item => item.schema ? [item.schema] : []))
  if (new Set([...current.schemas, ...references].map(schema => schema.id)).size > 64) throw publishedFeatureDenied()
  const objects = [...new Map([...current.schemas, ...references, ...current.groups.flatMap(group => group.objects.map(item => item.object))].map(item => [item.id, item])).values()]
  const storage = createCmsGraphStorage(env, { scope: snapshot.contentScope, context: snapshot.context })
  const bodies = new Map<string, Awaited<ReturnType<typeof storage.readObjects>>[number]>()
  let totalBytes = 0
  // Record validation resolves exact native schema metadata, never a D1 live head.
  for (let offset = 0;
    offset < objects.length;
    offset += 32) {
    const batch = objects.slice(offset, offset + 32), values = await storage.readObjects(batch.map(item => item.pin))
    for (let i = 0;
      i < batch.length;
      i++) {
      const metadata = batch[i]!, value = values[i]
      if (
        !value
        || !cmsEqual(value.pin, metadata.pin)
        || value.actorId !== metadata.actorId
        || new Date(value.createdAt).toISOString() !== metadata.createdAt
        || await collectionDigest(value.body) !== metadata.pin.sha256
        || size(value.body) !== metadata.pin.bytes
        || (metadata.pin.kind === 'schema' && value.schema !== null)
      ) throw publishedFeatureDenied()
      totalBytes += metadata.pin.bytes
      if (totalBytes > 1_000_000) throw publishedFeatureDenied()
      bodies.set(metadata.id, value)
    }
  }
  const definition = (object: AcceptedCmsObject) => {
    const parsed = CollectionDefinitionSchema.parse(bodies.get(object.id)!.body)
    if (!cmsEqual(parsed.scope, snapshot.contentScope) || parsed.id !== object.pin.collectionId || parsed.version !== object.pin.version) throw publishedFeatureDenied()
    return parsed
  }
  const projected = components.map((component) => {
    const data: Record<string, { id: string, values: Record<string, string | number | boolean> }[]> = Object.create(null)
    for (const binding of component.bindings) {
      const currentDefinition = definition(current.schemas.find(schema => schema.pin.collectionId === binding.collection.id)!)
      const pinnedDefinition = component.definitions.find(schema => schema.id === binding.collection.id)!
      data[binding.id] = current.groups.find(group => group.collectionId === binding.collection.id)!.objects.slice(0, binding.limit).map(({ object, schema }) => {
        const body = bodies.get(object.id)!, record = CollectionRecordSchema.parse(body.body)
        if (
          !schema
          || !cmsEqual(body.schema, schema.pin)
          || !cmsEqual(record.scope, snapshot.contentScope)
          || record.id !== object.pin.recordId
          || record.collectionId !== object.pin.collectionId
          || record.revision !== object.pin.version
          || record.schemaVersion !== schema.pin.version
          || record.archived
          || object.archived !== false
        ) throw publishedFeatureDenied()
        return { id: record.id, values: projectBuilderActionRecord({ storedDefinition: definition(schema), pinnedDefinition, currentDefinition, values: record.values, fields: binding.fields }) }
      })
    }
    return { pin: component.pin, artifact: component.artifact, definitions: component.definitions, data }
  })
  if (size(projected.map(component => component.data)) > 65_536) throw publishedFeatureDenied()
  const publicPages = pages.filter(item => item.visibility === 'public'), ids = new Set(publicPages.map(item => item.id))
  const routes = publicPages.map(item => ({ pageId: item.id, route: item.route, title: item.title, pageType: item.pageType, parentPageId: ids.has(item.parentPageId!) ? item.parentPageId : null }))
  const site: Record<string, BuilderGraphJson> = Object.create(null)
  for (const key of ['id', 'name', 'defaultLocale', 'theme', 'seo', 'shell', 'integrations']) if (recovered.checkpoint[key] !== undefined) site[key] = recovered.checkpoint[key]!
  const response = { version: 1 as const, release: snapshot.release, contentScope: snapshot.contentScope, application: snapshot.seal.application, checkpoint: { id: snapshot.seal.checkpoint, digest: snapshot.request.versionDigest }, page, site, routes, components: projected }
  if (size(response) > 2_000_000) throw publishedFeatureDenied()
  if (!cmsEqual(current, await capture())) throw publishedFeatureDenied()
  return response
}
