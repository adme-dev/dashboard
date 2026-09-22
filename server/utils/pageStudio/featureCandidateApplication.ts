import { z } from 'zod'
import { PageStudioBusinessContentError } from './businessContent'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { BuilderArtifactPinSchema, CmsPreparationSchema, CmsPreparationReceiptSchema, CmsStorageTargetSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { CollectionDefinitionSchema } from '~~/shared/pageStudio/collectionDefinition'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { verifyBuilderArtifactSet } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent, coordinateCmsGraphTransition, lookupCmsGraphOperation, cmsGraphEnvironment, cmsGraphConflict, type CmsGraphPrincipal, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { createCmsGraphStorage } from './cmsGraphStorage'
import { persistCandidateCheckpoint, type CandidateCheckpointBucket } from './candidateCheckpoint'
import { withCmsCommitAuthority } from './cmsCommitAuthority'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const ManagedFeatureAcceptanceRequestSchema = z.object({ id, digest }).strict()
// Read only the construction fields here. The single-source graph verifier
// independently validates all candidate evidence and final bytes before acceptance.
const candidateProjection = z.object({
  digest,
  proposalDigest: digest,
  summary: z.string().min(1).max(2000),
  proposal: z.object({
    id, scope: PageStudioContentScopeSchema,
    base: z.object({ checkpointId: z.string(), checkpointDigest: digest, contentRevision: z.number().int().nonnegative() }).strict(),
    existing: z.array(BuilderArtifactPinSchema).max(128),
    changes: z.array(BuilderArtifactPinSchema.extend({ expectedVersion: z.number().int().nonnegative() }).passthrough()).min(1).max(8)
  }).passthrough()
}).passthrough()
const identity = (pin: { kind: string, id: string }) => `${pin.kind}:${pin.id}`
type Pin = z.infer<typeof BuilderArtifactPinSchema>
const barePin = (pin: Pin): Pin => ({ id: pin.id, kind: pin.kind, version: pin.version, sha256: pin.sha256 })

/** High-level server-owned construction. The browser sends just a reviewed
 * candidate identity. D1 preparation and R2 checkpoint writes stay private until
 * coordinateCmsGraphTransition independently verifies and commits them natively. */
export async function acceptManagedFeatureCandidate(raw: unknown, principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}) {
  const input = ManagedFeatureAcceptanceRequestSchema.parse(raw)
  if (principal.source === 'studio-session' && (principal.capability !== 'model:invoke' || !principal.claims.capabilities.includes('model:invoke') || !principal.claims.capabilities.includes('workspace:checkpoint'))) throw new PageStudioBusinessContentError('CMS_GRAPH_AUTHORITY_DENIED', 403, 'Feature acceptance requires both AI and checkpoint access.')
  const snapshot = await readCmsGraphSnapshot(principal, deps)
  const env = cmsGraphEnvironment(principal)
  const operationId = `accept_feature_${await collectionDigest([snapshot.scope, input, snapshot.actor, snapshot.principalIdentity])}`
  const replay = await lookupCmsGraphOperation(operationId, principal, input, deps)
  if (replay) return replay
  const storage = createCmsGraphStorage(env, snapshot)
  const bytes = await storage.readCandidate(input.id)
  const candidate = candidateProjection.parse(JSON.parse(bytes))
  const { digest: candidateDigest, ...body } = candidate
  if (collectionCanonical(candidate) !== bytes || candidateDigest !== input.digest || await collectionDigest(body) !== candidateDigest || candidate.proposal.id !== input.id || contentScopeKey(candidate.proposal.scope) !== contentScopeKey(snapshot.scope)) throw cmsGraphConflict('The reviewed candidate identity changed.')
  if (candidate.proposal.base.checkpointId !== snapshot.checkpoint.id || candidate.proposal.base.checkpointDigest !== snapshot.checkpoint.digest || candidate.proposal.base.contentRevision !== (snapshot.content?.pin.version ?? 0)) throw cmsGraphConflict('Generate a new candidate from the current saved website and content.')
  const checkpoint = await storage.readCheckpoint(snapshot.checkpoint)
  const baseSchemas = await storage.readObjects(snapshot.schemas.map(item => item.pin))
  const collections = new Map<string, { pin: Pin, bytes: string }>()
  for (const object of baseSchemas) {
    const definition = CollectionDefinitionSchema.parse(object.body)
    const artifact = { kind: 'collection', definition }
    collections.set(definition.id, { pin: { kind: 'collection', id: definition.id, version: definition.version, sha256: await collectionDigest(artifact) }, bytes: collectionCanonical(artifact) })
  }
  const selected = new Map<string, Pin>([
    ...snapshot.context.application.manifest.components,
    ...snapshot.context.application.manifest.actions,
    ...[...collections.values()].map(item => item.pin)
  ].map(pin => [identity(pin), pin]))
  const artifacts = new Map<string, string>()
  for (const pin of [...candidate.proposal.existing, ...candidate.proposal.changes]) {
    const key = collectionCanonical(barePin(pin))
    if (artifacts.has(key)) continue
    const adopted = collections.get(pin.id)
    const artifactBytes = pin.kind === 'collection' && adopted && collectionCanonical(adopted.pin) === key ? adopted.bytes : await storage.readArtifact(barePin(pin))
    artifacts.set(key, artifactBytes)
  }
  const checked = await verifyBuilderArtifactSet({ scope: snapshot.scope, proposalBytes: collectionCanonical(candidate.proposal), artifactBytes: [...artifacts.values()] })
  if (checked.digest !== candidate.proposalDigest) throw cmsGraphConflict('The reviewed candidate dependencies changed.')
  const schemaItems = []
  for (const change of candidate.proposal.changes) {
    if ((selected.get(identity(change))?.version ?? 0) !== change.expectedVersion) throw cmsGraphConflict('A selected feature version changed.')
    selected.set(identity(change), barePin(change))
    if (change.kind === 'collection') {
      const artifact = z.object({ kind: z.literal('collection'), definition: CollectionDefinitionSchema }).strict().parse(JSON.parse(artifacts.get(collectionCanonical(barePin(change)))!))
      schemaItems.push({ kind: 'schema' as const, version: change.version, expectedBase: snapshot.schemas.find(item => item.pin.collectionId === change.id)?.pin ?? null, body: artifact.definition })
    }
  }
  const manifest = z.object({ id: z.string(), schemaVersion: z.literal(2) }).passthrough().parse(structuredClone(checkpoint.manifest))
  const pins = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  manifest.builderLibrary = { scope: snapshot.scope, components: pins.filter(pin => pin.kind === 'component') }
  manifest.builderApplication = { version: 1, scope: snapshot.scope, actions: pins.filter(pin => pin.kind === 'action'), collections: pins.filter(pin => pin.kind === 'collection') }
  const router = env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsTarget?: (input: unknown) => Promise<unknown>, prepareManagedCmsOperation?: (input: unknown) => Promise<unknown> }
  const assertTarget = async () => {
    if (!router?.readManagedCmsTarget) throw cmsGraphConflict('Private CMS storage is unavailable.')
    const actual = CmsStorageTargetSchema.parse(await router.readManagedCmsTarget({ scope: snapshot.scope }))
    if (collectionCanonical(actual) !== collectionCanonical(snapshot.context.state.target)) throw cmsGraphConflict('The CMS storage target changed.')
  }
  await assertCmsGraphSnapshotCurrent(snapshot, principal, deps)
  await assertTarget()
  const preparations: Array<{ operationId: string, requestDigest: string, receiptDigest: string }> = []
  if (schemaItems.length) {
    await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: 'collection-schema' }, async () => {}, deps)
    if (!router.prepareManagedCmsOperation) throw cmsGraphConflict('Private CMS preparation is unavailable.')
    const preparation = CmsPreparationSchema.parse({ formatVersion: 1, scope: snapshot.scope, actor: snapshot.actor, action: null, candidateDigest, operationId: `schemas_${operationId}`, freezeDigest: snapshot.context.state.freeze_digest, items: schemaItems })
    const receipt = CmsPreparationReceiptSchema.parse(await router.prepareManagedCmsOperation(preparation))
    const { digest: receiptDigest, ...receiptBody } = receipt
    if (receipt.requestDigest !== await collectionDigest(preparation) || receiptDigest !== await collectionDigest(receiptBody) || receipt.operationId !== preparation.operationId || contentScopeKey(receipt.scope) !== contentScopeKey(snapshot.scope) || receipt.freezeDigest !== preparation.freezeDigest) throw cmsGraphConflict('Private preparation acknowledgement is inconsistent.')
    preparations.push({ operationId: receipt.operationId, requestDigest: receipt.requestDigest, receiptDigest })
  }
  await assertTarget()
  await assertCmsGraphSnapshotCurrent(snapshot, principal, deps)
  const workspace = { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId }
  const nextCheckpoint = await persistCandidateCheckpoint({ checkpointId: `checkpoint_feature_${operationId.slice('accept_feature_'.length)}`, scope: workspace, manifest, digest: await collectionDigest(manifest), userId: snapshot.actor.userId }, env.PAGE_STUDIO_CHECKPOINTS as CandidateCheckpointBucket)
  return await coordinateCmsGraphTransition({ operationId, candidateId: input.id, candidateDigest, expectedApplication: { id: snapshot.context.application.id, digest: snapshot.context.application.digest }, expectedCheckpoint: { id: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest }, expectedContent: snapshot.content?.pin ?? null, contentRevision: candidate.proposal.base.contentRevision, nextCheckpoint, preparations, summary: candidate.summary }, principal, deps)
}
