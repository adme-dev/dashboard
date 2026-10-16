import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest, CollectionRecordSchema } from '~~/shared/pageStudio/collectionApi'
import { PageStudioBusinessContentSchema } from '~~/shared/pageStudio/businessContent'
import { CollectionDefinitionSchema, parseCollectionValues } from '~~/shared/pageStudio/collectionDefinition'
import { CmsObjectPinSchema, CmsStorageTargetSchema } from '~~/shared/pageStudio/cmsManaged'
import { deriveManagedTransferCopyClosure, deriveManagedTransferGraphIdentities } from '~~/shared/pageStudio/managed-transfer-copy-plan'
import { ManagedTransferCopyGraphRequestSchema } from '~~/shared/pageStudio/managed-transfer-copy-contract'
import { createCmsGraphStorage } from '~~/server/utils/pageStudio/cmsGraphStorage'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { withReservedManagedTransfer } from '~~/server/utils/pageStudio/managedTransferIntent'
import type { retainedManagedTransferDestinationExecution } from '~~/server/utils/pageStudio/managedTransferDestinationExecution'
import type { requireMatchingManagedTransferDestinationExecutionProof } from '~~/shared/pageStudio/managed-transfer-destination-execution-result'
import { verifyBuilderApplicationSnapshot } from '../generated/builderGraphVerifier.mjs'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
export type Execution = NonNullable<Awaited<ReturnType<typeof retainedManagedTransferDestinationExecution>>>
export type Proof = Awaited<ReturnType<typeof requireMatchingManagedTransferDestinationExecutionProof>>
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const invalid = () => createError({ statusCode: 409, statusMessage: 'Managed transfer source graph changed or is unavailable' })
const stored = z.object({ pin: CmsObjectPinSchema, body: z.unknown(), schema: CmsObjectPinSchema.nullable(), actorId: z.string(),
  createdAt: z.string(), head: z.boolean() }).strict()
export type Discovery = { checkpoint: { id: string, digest: string, manifest: unknown }, objects: z.infer<typeof stored>[], artifactBytes: string[] }
function inventory(intent: Intent) {
  return { scope: intent.authority.source, freezeDigest: intent.source.context.state.freeze_digest,
    currentContentId: intent.source.context.state.current_content_id, selections: intent.source.context.selections.map(item => ({ collectionId: item.collection_id, objectId: item.object_id })),
    recordHeads: intent.source.recordHeads, objects: intent.source.objects }
}

/** Capture only configured staging readers. No browser URL or production fallback. */
export function createTransferCopyReaders(env: Record<string, unknown>) {
  const service = env.PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER as Record<string, unknown> | undefined
  const target = capturePageStudioRpcMethod(service, 'readManagedCmsTarget')
  const objects = capturePageStudioRpcMethod(service, 'readManagedCmsObjectsAtTarget')
  const fetch = capturePageStudioRpcMethod(service, 'fetch')
  const bucket = env.PAGE_STUDIO_CMS_STAGING_CHECKPOINTS as Record<string, unknown> | undefined
  const get = capturePageStudioRpcMethod(bucket, 'get')
  const transport = env.PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT
  if (!target || !get || (transport === 'placed-fetch' ? !fetch : !objects)) throw createError({ statusCode: 503, statusMessage: 'Original transfer storage is unavailable' })
  const readers = { PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: target, readManagedCmsObjectsAtTarget: objects, fetch },
    PAGE_STUDIO_CHECKPOINTS: { get }, PAGE_STUDIO_CMS_OBJECT_TRANSPORT: transport }
  return async (intent: Intent): Promise<Discovery> => {
    const source = inventory(intent)
    const storage = createCmsGraphStorage(readers, { scope: source.scope, context: { state: { target: intent.source.context.state.target } } })
    const checkpoint = await storage.readCheckpoint(intent.source.checkpoint)
    const closure = deriveManagedTransferCopyClosure(source, checkpoint.manifest)
    const actual = CmsStorageTargetSchema.parse(await target({ scope: structuredClone(source.scope) }))
    if (!equal(actual, intent.source.context.state.target)) throw invalid()
    const observed = structuredClone(await storage.readObjects(closure.map(item => item.pin)))
    const roots = [...intent.source.context.application.manifest.actions, ...intent.source.context.application.manifest.components]
    const unique = new Map(roots.map(pin => [canonical(pin), pin]))
    const artifactBytes: string[] = []
    for (const pin of unique.values()) artifactBytes.push(await storage.readArtifact(pin))
    if (!equal(CmsStorageTargetSchema.parse(await target({ scope: structuredClone(source.scope) })), actual)) throw invalid()
    return { checkpoint, objects: observed, artifactBytes }
  }
}

/** Rebuild from original native source and immutable actual destination proof.
 * This validates stored retries as well as freshly discovered bytes. */
export async function planTransferCopyGraph(intent: Intent, execution: Execution, proof: Proof, discoveryInput: Discovery, createdAt: string) {
  const discovery = structuredClone(discoveryInput)
  const source = inventory(intent), closure = deriveManagedTransferCopyClosure(source, discovery.checkpoint.manifest)
  if (!equal({ id: discovery.checkpoint.id, digest: discovery.checkpoint.digest }, { id: intent.source.checkpoint.id, digest: intent.source.checkpoint.digest })) throw invalid()
  const objects = z.array(stored).length(closure.length).parse(discovery.objects)
  for (const [index, object] of objects.entries()) {
    const accepted = closure[index]!
    const body = (accepted.pin.kind === 'schema' ? CollectionDefinitionSchema : accepted.pin.kind === 'record' ? CollectionRecordSchema : PageStudioBusinessContentSchema).parse(object.body)
    if (!equal(object.pin, accepted.pin) || !equal(body, object.body) || !equal(body.scope, source.scope)
      || new TextEncoder().encode(canonical(object.body)).byteLength !== accepted.pin.bytes
      || await collectionDigest(object.body) !== accepted.pin.sha256 || object.actorId !== accepted.actorId
      || new Date(object.createdAt).toISOString() !== accepted.createdAt) throw invalid()
    if (accepted.pin.kind === 'schema') {
      const schema = CollectionDefinitionSchema.parse(body)
      if (schema.id !== accepted.pin.collectionId || schema.version !== accepted.pin.version || object.schema !== null) throw invalid()
    } else if (accepted.pin.kind === 'record') {
      const record = CollectionRecordSchema.parse(body), schemaIndex = closure.findIndex(item => item.id === accepted.schemaObjectId)
      const schema = objects[schemaIndex]
      if (!schema || record.id !== accepted.pin.recordId || record.collectionId !== accepted.pin.collectionId || record.revision !== accepted.pin.version
        || record.archived !== accepted.archived || schema.pin.kind !== 'schema' || record.schemaVersion !== schema.pin.version || !equal(object.schema, schema.pin)) throw invalid()
      parseCollectionValues(schema.body, record.values)
    } else if (object.schema !== null) throw invalid()
  }
  const intentDigest = await collectionDigest(intent)
  if (execution.operationId !== intent.operationId || execution.intentDigest !== intentDigest || proof.requestDigest !== await collectionDigest(execution)
    || !equal(execution.freezeRequest.scope, intent.authority.destination)) throw invalid()
  const content = closure.find(item => item.id === source.currentContentId)?.pin ?? null
  const base = { scope: source.scope, generation: intent.source.context.state.active_generation, target: intent.source.context.state.target,
    freezeDigest: source.freezeDigest, application: { manifest: intent.source.context.application.manifest, digest: intent.source.context.application.digest },
    checkpoint: discovery.checkpoint, content: { pin: content, revision: content?.version ?? 0 },
    schemas: source.selections.map((selection) => {
      const index = closure.findIndex(item => item.id === selection.objectId)
      if (index < 0) throw invalid()
      return { objectId: selection.objectId, pin: closure[index]!.pin, bodyBytes: canonical(objects[index]!.body) }
    }) }
  const graph = { scope: source.scope, base, artifactBytes: discovery.artifactBytes, objects: closure.map(item => item.pin) }
  const graphProof = await verifyBuilderApplicationSnapshot(graph)
  const ids = await deriveManagedTransferGraphIdentities({ operationId: intent.operationId, intentDigest, sourceDigest: intent.sourceDigest,
    destinationExecutionProofDigest: proof.digest, generation: intent.destination.generation, sourceObjectIds: closure.map(item => item.id),
    selectedSchemaObjectIds: source.selections.map(item => item.objectId) })
  if (ids.applicationId === intent.source.context.application.id || ids.checkpointId === intent.source.checkpoint.id) throw invalid()
  const request = ManagedTransferCopyGraphRequestSchema.parse({ formatVersion: 1, operationId: intent.operationId, intentDigest, sourceDigest: intent.sourceDigest,
    destinationExecutionRequestDigest: proof.requestDigest, destinationExecutionProofDigest: proof.digest, destinationExecutionIdentity: proof.envelope.execution.identity,
    copy: { formatVersion: 1, transferId: intent.operationId, actor: execution.freezeRequest.actor,
      source: { scope: source.scope, target: base.target, generation: base.generation, freezeDigest: base.freezeDigest,
        application: { id: base.application.manifest.applicationId, digest: base.application.digest },
        checkpoint: { id: base.checkpoint.id, digest: base.checkpoint.digest }, contentHead: content, objects: graph.objects },
      destination: { scope: execution.freezeRequest.scope, target: execution.freezeRequest.target, freezeReceipt: proof.envelope.execution.freeze } },
    sourceGraph: graph, sourceArtifactPins: graphProof.pins,
    sourceObjects: objects.map((object, index) => ({ ...object, nativeId: closure[index]!.id, createdAt: new Date(object.createdAt).toISOString() })),
    destinationGraph: { scope: execution.freezeRequest.scope, target: execution.freezeRequest.target, freezeDigest: proof.envelope.execution.freeze.digest,
      generation: ids.generation, applicationId: ids.applicationId, checkpointId: ids.checkpointId, schemaObjects: ids.schemaObjects },
    objectIds: ids.objectIds, checkpointMetadata: { createdAt, userId: execution.freezeRequest.actor.userId } })
  if (new TextEncoder().encode(canonical(request)).byteLength > 12_000_000) throw createError({ statusCode: 413, statusMessage: 'The required transfer graph exceeds its supported budget' })
  return request
}
