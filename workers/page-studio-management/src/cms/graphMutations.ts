import { checkpointStagingOrigin } from '~~/server/utils/pageStudio/checkpointStagingOrigin'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { BuilderArtifactPinSchema, CmsApplicationManifestSchema, CmsObjectPinSchema, CmsNativeCommitSchema } from '~~/shared/pageStudio/cmsManaged'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { verifyBuilderApplicationTransition, verifyBuilderApplicationCheckpoint, parseBuilderArtifactJson, BuilderGraphVerificationError, type BuilderGraphProof } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { createCmsGraphStorage } from '~~/server/utils/pageStudio/cmsGraphStorage'
import { PageStudioHistoryMutationSchema, type PageStudioHistoryMutation } from '~~/shared/pageStudio/draftHistory'
import { persistCandidateCheckpoint, type CandidateCheckpointBucket } from '~~/server/utils/pageStudio/candidateCheckpoint'
import { verifyCmsPreparation, insertVerifiedCmsObjects } from '~~/server/utils/pageStudio/cmsCommits'
import { PageStudioBusinessContentError } from '~~/server/utils/pageStudio/businessContent'
import { withCmsCommitAuthority } from '~~/server/utils/pageStudio/cmsCommitAuthority'
import { cmsEqual } from '~~/server/utils/pageStudio/cmsVisibility'
import type { PageStudioCheckpointInput, PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { readCmsGraphSnapshot, snapshotInTransaction, graphCheckpointMutation, cmsGraphConflict, cmsGraphEnvironment, type CmsGraphPrincipal, type CmsGraphDependencies, type CmsGraphSnapshot, type CmsGraphTransitionInput, type CmsGraphCommitReceipt } from '~~/server/utils/pageStudio/cmsGraphRead'
import { readBounded } from './boundedReads'
import { checkpointStage, checkpointTiming, logCheckpointTiming } from './checkpointStage'

/** R2 GETs in flight per graph read; up to 288 pins otherwise run back to back. */
const ARTIFACT_READ_CONCURRENCY = 8
const denyCustomerGraphOperation = () => new PageStudioBusinessContentError('CMS_GRAPH_AUTHORITY_DENIED', 403, 'Customer sessions allow ordinary page saves only.')
const graphId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const graphDigest = z.string().regex(/^[a-f0-9]{64}$/)
const expectedCheckpoint = z.object({ id: graphId, digest: graphDigest }).strict()
const graphCheckpoint = z.object({
  checkpointId: graphId, digest: graphDigest, objectKey: z.string().max(1024),
  createdAt: z.iso.datetime(), etag: z.string().min(1).max(256), userId: z.string().min(1).max(128),
  scope: PageStudioContentScopeSchema.pick({ tenantId: true, clientId: true, siteId: true }).strict()
}).strict()
// Zod's inferred union/nullable properties appear optional under Nuxt's loose
// null checking. Project the validated required fields without widening input.
function requiredCheckpointScope(value: z.infer<typeof graphCheckpoint>): PageStudioCheckpointInput {
  return { ...value, scope: { ...value.scope, siteId: value.scope.siteId } }
}
const transitionInput = z.object({
  operationId: graphId, candidateId: graphId, candidateDigest: graphDigest, privacyReviewDigest: graphDigest.optional(),
  expectedApplication: z.object({ id: z.uuid(), digest: graphDigest }).strict(), expectedCheckpoint,
  expectedContent: CmsObjectPinSchema.nullable(), contentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  nextCheckpoint: graphCheckpoint,
  preparations: z.array(z.object({ operationId: graphId, requestDigest: graphDigest, receiptDigest: graphDigest }).strict()).max(32),
  summary: z.string().min(1).max(4000)
}).strict()
async function verifyGraph(work: () => Promise<BuilderGraphProof>) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof BuilderGraphVerificationError)
      throw new PageStudioBusinessContentError(error.code, 422, error.message)
    throw error
  }
}
function requestFor(snapshot: CmsGraphSnapshot, input: CmsGraphTransitionInput) {
  return {
    version: 1, operationId: input.operationId, scope: snapshot.scope, generation: snapshot.context.state.active_generation,
    target: snapshot.context.state.target, freezeDigest: snapshot.context.state.freeze_digest,
    expectedApplication: input.expectedApplication, expectedCheckpoint: input.expectedCheckpoint,
    expectedContent: input.expectedContent, contentRevision: input.contentRevision,
    nextCheckpoint: { id: input.nextCheckpoint.checkpointId, digest: input.nextCheckpoint.digest },
    candidateId: input.candidateId, candidateDigest: input.candidateDigest, preparations: input.preparations,
    ...(input.privacyReviewDigest ? { privacyReviewDigest: input.privacyReviewDigest } : {})
  }
}
async function readBase(snapshot: CmsGraphSnapshot, storage: ReturnType<typeof createCmsGraphStorage>) {
  const checkpoint = await storage.readCheckpoint(snapshot.checkpoint)
  const objects = snapshot.schemas.length ? await storage.readObjects(snapshot.schemas.map(item => item.pin)) : []
  for (let index = 0; index < objects.length; index++) {
    if (objects[index]!.actorId !== snapshot.schemas[index]!.actorId || new Date(objects[index]!.createdAt).toISOString() !== snapshot.schemas[index]!.createdAt) throw cmsGraphConflict()
  }
  return {
    scope: snapshot.scope, generation: snapshot.context.state.active_generation, target: snapshot.context.state.target,
    freezeDigest: snapshot.context.state.freeze_digest,
    application: { manifest: snapshot.context.application.manifest, digest: snapshot.context.application.digest },
    checkpoint, content: { pin: snapshot.content?.pin ?? null, revision: snapshot.content?.pin.version ?? 0 },
    schemas: objects.map((object, index) => ({ objectId: snapshot.schemas[index]!.id, pin: object.pin, bodyBytes: collectionCanonical(object.body) }))
  }
}
async function readArtifacts(snapshot: CmsGraphSnapshot, storage: ReturnType<typeof createCmsGraphStorage>, base: Awaited<ReturnType<typeof readBase>>, candidateBytes?: string) {
  const roots: Array<z.infer<typeof BuilderArtifactPinSchema>> = [...snapshot.context.application.manifest.components, ...snapshot.context.application.manifest.actions]
  if (candidateBytes) {
    const candidate = z.object({ proposal: z.object({ changes: z.array(z.unknown()).max(32), existing: z.array(z.unknown()).max(128) }) }).parse(parseBuilderArtifactJson(candidateBytes))
    for (const raw of [...candidate.proposal.changes, ...candidate.proposal.existing]) {
      const pin = BuilderArtifactPinSchema.passthrough().parse(raw)
      roots.push(BuilderArtifactPinSchema.parse({ kind: pin.kind, id: pin.id, version: pin.version, sha256: pin.sha256 }) as typeof roots[number])
    }
  }
  const baselineWrappers = new Set<string>()
  for (const schema of base.schemas) baselineWrappers.add(await collectionDigest({ kind: 'collection', definition: JSON.parse(schema.bodyBytes) }))
  const unique = new Map(roots.map(pin => [collectionCanonical(pin), pin]))
  if (unique.size > 288) throw cmsGraphConflict('The feature graph exceeds the artifact limit.')
  const pending = [...unique.values()].filter(pin => !(pin.kind === 'collection' && baselineWrappers.has(pin.sha256)))
  return await readBounded(pending, ARTIFACT_READ_CONCURRENCY, pin => storage.readArtifact(pin))
}
type PreparedGraph = {
  snapshot: CmsGraphSnapshot
  input: CmsGraphTransitionInput
  proof: BuilderGraphProof
  preparations: Array<Awaited<ReturnType<typeof verifyCmsPreparation>>>
  mode?: 'feature' | 'checkpoint' | 'ai-page' | 'restore'
  caller?: unknown
  pageCount: number
  history?: PageStudioHistoryMutation
}
async function replayExact(db: PageStudioControlQueryClient, snapshot: CmsGraphSnapshot, input: CmsGraphTransitionInput, mode = 'feature'): Promise<CmsGraphCommitReceipt | null> {
  const rows = (await db.query<{ request: { intent: CmsGraphTransitionInput, actor: unknown, principalIdentity: unknown, mode: string }, result: CmsGraphCommitReceipt }>(
    'SELECT request,result FROM page_studio_cms_commits WHERE scope_key=$1 AND operation_id=$2', [snapshot.context.state.scope_key, input.operationId]
  )).rows
  if (!rows.length) return null
  const row = rows[0]!
  if (row.request.mode !== mode || !cmsEqual(row.request.intent, input) || !cmsEqual(row.request.actor, snapshot.actor) || !cmsEqual(row.request.principalIdentity, snapshot.principalIdentity)) throw cmsGraphConflict('This operation identity already represents another request.')
  return { ...row.result, currentCheckpointId: snapshot.checkpoint.id, isCurrent: row.result.checkpointId === snapshot.checkpoint.id && row.result.application.id === snapshot.context.application.id }
}
async function commitPreparedGraph(prepared: PreparedGraph, principal: CmsGraphPrincipal, deps: CmsGraphDependencies): Promise<{ receipt: CmsGraphCommitReceipt, replayed: boolean }> {
  const { snapshot, input, proof } = prepared
  const mode = prepared.mode ?? 'feature'
  const mutation = prepared.preparations.length ? 'collection-schema' as const : graphCheckpointMutation(principal)
  return await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation }, async (db) => {
    const current = await snapshotInTransaction(db, snapshot.scope, principal)
    const replay = await replayExact(db, current, input, mode)
    if (replay) return { receipt: replay, replayed: true }
    if (!cmsEqual(snapshot, current)) throw cmsGraphConflict()
    const limits = (await db.query<{ pages_per_site_limit: number }>('SELECT entitlement.pages_per_site_limit FROM page_studio_sites site JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3', [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId])).rows
    if (limits.length !== 1 || prepared.pageCount > limits[0]!.pages_per_site_limit) throw cmsGraphConflict('The saved pages exceed the current website allowance.')
    const cp = input.nextCheckpoint, state = current.context.state, appId = randomUUID(), commitId = randomUUID(), auditId = randomUUID()
    const ids = new Map(current.schemas.map(object => [collectionCanonical(object.pin), object.id]))
    for (const preparation of prepared.preparations) {
      for (const item of preparation.request.items) {
        if (item.kind !== 'schema') throw cmsGraphConflict()
        const previous = current.schemas.find(object => object.pin.collectionId === item.body.id)
        if (!cmsEqual(previous?.pin ?? null, item.expectedBase)) throw cmsGraphConflict()
        const conflict = (await db.query('SELECT id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind=\'schema\' AND collection_id=$3 AND logical_version=$4', [state.scope_key, state.active_generation, item.body.id, item.version])).rows
        if (conflict.length) throw cmsGraphConflict('This schema version already exists.')
      }
      for (const object of await insertVerifiedCmsObjects(db, current.context, preparation, commitId)) ids.set(collectionCanonical(object.pin), object.id)
    }
    const schemas = proof.schemas.map((selection) => {
      const objectId = ids.get(collectionCanonical(selection.storage))
      if (!objectId || (selection.objectId !== null && selection.objectId !== objectId)) throw cmsGraphConflict()
      return { collectionId: selection.artifact.id, objectId }
    })
    const manifest = CmsApplicationManifestSchema.parse({ formatVersion: 1, scope: snapshot.scope, generation: state.active_generation, applicationId: appId,
      checkpoint: proof.nextCheckpoint, schemas, components: proof.components, actions: proof.actions, previousApplicationId: current.context.application.id })
    const digest = await collectionDigest(manifest)
    const existing = (await db.query('SELECT digest,object_key,etag,author_id,created_at FROM page_studio_checkpoints WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4', [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.checkpointId])).rows
    if (existing.length) {
      const row = existing[0]!
      if (row.digest !== cp.digest || row.object_key !== cp.objectKey || row.etag !== cp.etag || row.author_id !== cp.userId || new Date(row.created_at as string).toISOString() !== cp.createdAt) throw cmsGraphConflict('Checkpoint identity was already used.')
    } else await db.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [cp.checkpointId, snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.digest, cp.objectKey, cp.etag, cp.userId, cp.createdAt])
    const role = snapshot.actor.kind === 'agency-user' ? 'agency' : snapshot.actor.kind === 'customer-user' ? 'customer' : 'client'
    const version = mode === 'feature' || mode === 'ai-page'
      ? (await db.query<{ id: string }>(`INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'in_review',$9,clock_timestamp()) RETURNING id`,
          [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.checkpointId, cp.digest, cp.userId, role, input.summary, input.operationId])).rows[0]!
      : null
    await db.query('INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,previous_application_id,commit_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [state.scope_key, state.active_generation, appId, digest, manifest, current.context.application.id, commitId])
    for (const schema of schemas) await db.query('INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id) VALUES($1,$2,$3,$4,$5)', [state.scope_key, state.active_generation, appId, schema.collectionId, schema.objectId])
    const receipt: CmsGraphCommitReceipt = { acknowledged: true, operationId: input.operationId, checkpointId: cp.checkpointId, application: { id: appId, digest }, versionId: version?.id ?? null, currentCheckpointId: cp.checkpointId, isCurrent: true }
    const request = { intent: input, actor: snapshot.actor, principalIdentity: snapshot.principalIdentity, mutation, mode, caller: prepared.caller ?? null }
    await db.query(`INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,'cms.graph.accepted','cms-operation',$7,$8,$9)`, [auditId, snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.userId, role, input.operationId, `cms:graph:${input.operationId}`, { requestDigest: proof.requestDigest, proofDigest: proof.proofDigest, application: receipt.application, checkpointId: cp.checkpointId }])
    await db.query('INSERT INTO page_studio_cms_commits(scope_key,generation,id,operation_id,request_digest,prepared_digest,request,result,actor_id,audit_id,tenant_id,client_id,site_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [state.scope_key, state.active_generation, commitId, input.operationId, await collectionDigest(request), proof.proofDigest, request, receipt, cp.userId, auditId, snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId])
    await db.query('UPDATE page_studio_cms_scopes SET current_application_id=$2 WHERE scope_key=$1', [state.scope_key, appId])
    await db.query(`UPDATE page_studio_sites SET current_checkpoint_id=$4,current_version_id=CASE WHEN $6='checkpoint' THEN current_version_id ELSE $5::uuid END,updated_at=clock_timestamp() WHERE tenant_id=$1 AND client_id=$2 AND id=$3`, [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.checkpointId, version?.id ?? null, mode])
    const stagingOrigin = principal.source === 'customer-session'
      ? null
      : checkpointStagingOrigin({ formatVersion: 1, environment: cmsGraphEnvironment(principal).PAGE_STUDIO_RELEASE_ENVIRONMENT,
          source: snapshot.principalIdentity.source, userId: snapshot.actor.userId, role, loginSessionHash: snapshot.actor.loginSessionHash,
          ...(snapshot.principalIdentity.source === 'studio-session' ? { nonce: snapshot.principalIdentity.nonce } : {}) })
    for (const action of version ? ['workspace.checkpointed', 'version.registered', 'version.submitted'] : ['workspace.checkpointed']) await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.userId, role, action, action === 'workspace.checkpointed' ? 'checkpoint' : 'version', action === 'workspace.checkpointed' ? cp.checkpointId : version!.id, `cms:graph:${input.operationId}:${action}`, { checkpointId: cp.checkpointId, digest: cp.digest, applicationId: appId, commitProtocol: 'cms-graph-v1', ...(principal.source === 'customer-session' ? { customerEditor: { sessionId: principal.claims.nonce, userId: principal.claims.userId, workspaceId: principal.claims.workspaceId } } : {}), expectedCheckpointId: input.expectedCheckpoint.id, ...(action === 'workspace.checkpointed' && stagingOrigin ? { stagingOrigin } : {}) }])
    if (prepared.history) await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,'draft.history.saved','checkpoint',$6,$7,$8)`,
      [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, cp.userId, role, cp.checkpointId, `history:${role}:${cp.userId}:${prepared.history.requestId}`, { request: prepared.history, checkpointId: cp.checkpointId }])
    return { receipt, replayed: false }
  }, deps)
}
/** Actual immutable bytes outside locks; native visibility and receipt in one SQL transaction. */
export async function coordinateCmsGraphTransition(raw: CmsGraphTransitionInput, principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}): Promise<CmsGraphCommitReceipt> {
  if (principal.source === 'studio-session' && (principal.capability !== 'model:invoke'
    || !principal.claims.capabilities.includes('workspace:checkpoint')
    || !principal.claims.capabilities.includes('model:invoke')))
    throw new PageStudioBusinessContentError('CMS_GRAPH_AUTHORITY_DENIED', 403, 'Feature acceptance requires checkpoint and model invocation authority.')
  if (principal.source === 'customer-session') throw denyCustomerGraphOperation()
  const parsed = transitionInput.parse(raw)
  const input: CmsGraphTransitionInput = { ...parsed, expectedContent: parsed.expectedContent, nextCheckpoint: requiredCheckpointScope(parsed.nextCheckpoint) }
  const snapshot = await readCmsGraphSnapshot(principal, deps)
  if (input.nextCheckpoint.userId !== snapshot.actor.userId || !cmsEqual(input.nextCheckpoint.scope, { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId })) throw cmsGraphConflict('Checkpoint author or scope does not match the current session.')
  const replay = await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: input.preparations.length ? 'collection-schema' : 'business-content' }, async db => replayExact(db, await snapshotInTransaction(db, snapshot.scope, principal), input), deps)
  if (replay) return replay
  const env = cmsGraphEnvironment(principal), storage = createCmsGraphStorage(env, snapshot)
  const configuredRuntime = graphDigest.safeParse(env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST)
  if (!configuredRuntime.success) throw new PageStudioBusinessContentError('CMS_GRAPH_RUNTIME_UNAVAILABLE', 503, 'The feature action test runtime is not configured.')
  const expectedRuntimeDigest = configuredRuntime.data
  const base = await readBase(snapshot, storage), candidateBytes = await storage.readCandidate(input.candidateId)
  const artifactBytes = await readArtifacts(snapshot, storage, base, candidateBytes)
  const nextCheckpoint = await storage.readCheckpoint({ id: input.nextCheckpoint.checkpointId, digest: input.nextCheckpoint.digest, object_key: input.nextCheckpoint.objectKey })
  const preparations: PreparedGraph['preparations'] = []
  for (const ref of input.preparations) {
    const commit = CmsNativeCommitSchema.parse({ formatVersion: 1, scope: snapshot.scope, operationId: ref.operationId, generation: snapshot.context.state.active_generation, target: snapshot.context.state.target, freezeDigest: snapshot.context.state.freeze_digest, preparedDigest: ref.receiptDigest, preparedRequestDigest: ref.requestDigest, expectedApplication: input.expectedApplication, expectedCheckpoint: input.expectedCheckpoint, expectedContent: input.expectedContent, expectedSchemas: [], expectedRecords: [] })
    const preparation = await verifyCmsPreparation(commit, storage.readPreparation)
    if (!cmsEqual(preparation.request.actor, snapshot.actor)) throw cmsGraphConflict('Prepared schemas belong to a different native session.')
    preparations.push(preparation)
  }
  const proof = await verifyGraph(() => verifyBuilderApplicationTransition({ request: requestFor(snapshot, input), base, nextCheckpoint, candidateBytes, artifactBytes,
    preparations: preparations.map(item => ({ requestBytes: collectionCanonical(item.request), receiptBytes: collectionCanonical(item.receipt) })), expectedRuntimeDigest }))
  return (await commitPreparedGraph({ snapshot, input, proof, preparations, pageCount: (nextCheckpoint.manifest as { pages: unknown[] }).pages.length }, principal, deps)).receipt
}

/** Managed ordinary save: the caller supplies pages, never a different graph. */
export async function coordinateCmsGraphCheckpoint(
  raw: { checkpoint: PageStudioCheckpointInput, expectedCheckpointId: string | null },
  principal: CmsGraphPrincipal,
  deps: CmsGraphDependencies = {},
  internal: { mode?: 'checkpoint' | 'ai-page' | 'restore', summary?: string, idempotencyKey?: string, expectedBaseDigest?: string, history?: PageStudioHistoryMutation } = {}
): Promise<CmsGraphCommitReceipt> {
  const parsed = z.object({ checkpoint: graphCheckpoint, expectedCheckpointId: graphId.nullable() }).strict().parse(raw)
  const caller = { ...parsed, checkpoint: requiredCheckpointScope(parsed.checkpoint), acceptance: internal }
  const mode = internal.mode ?? 'checkpoint'
  if (principal.source === 'customer-session' && (mode !== 'checkpoint' || Object.keys(internal).length !== 0)) throw denyCustomerGraphOperation()
  if (mode === 'ai-page' && principal.source === 'studio-session' && principal.capability !== 'model:invoke') throw cmsGraphConflict('AI page acceptance requires model invocation authority.')
  const timing = checkpointTiming()
  let outcome: 'committed' | 'replayed' | 'failed' = 'failed'
  try {
    const snapshot = await checkpointStage('snapshot', () => readCmsGraphSnapshot(principal, deps), timing)
    const operationId = `${mode.replace('-', '_')}_${await collectionDigest([snapshot.scope, internal.idempotencyKey ?? caller.checkpoint.checkpointId])}`
    const original = await checkpointStage('replay', () => withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: graphCheckpointMutation(principal) }, async (db) => {
      const current = await snapshotInTransaction(db, snapshot.scope, principal)
      const rows = (await db.query<{ request: { intent: CmsGraphTransitionInput, caller: unknown, mode: string }, result: CmsGraphCommitReceipt }>('SELECT request,result FROM page_studio_cms_commits WHERE scope_key=$1 AND operation_id=$2', [current.context.state.scope_key, operationId])).rows
      if (!rows.length) return null
      if (!cmsEqual(rows[0]!.request.caller, caller) || rows[0]!.request.mode !== mode) throw cmsGraphConflict()
      return await replayExact(db, current, rows[0]!.request.intent, mode)
    }, deps), timing)
    if (original) {
      outcome = 'replayed'
      return original
    }
    if ((internal.expectedBaseDigest !== undefined && internal.expectedBaseDigest !== snapshot.checkpoint.digest) || caller.expectedCheckpointId !== snapshot.checkpoint.id || caller.checkpoint.userId !== snapshot.actor.userId || !cmsEqual(caller.checkpoint.scope, { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId })) throw cmsGraphConflict()
    const input: CmsGraphTransitionInput = {
      operationId, candidateId: caller.checkpoint.checkpointId, candidateDigest: caller.checkpoint.digest,
      expectedApplication: { id: snapshot.context.application.id, digest: snapshot.context.application.digest },
      expectedCheckpoint: { id: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest },
      expectedContent: snapshot.content?.pin ?? null, contentRevision: snapshot.content?.pin.version ?? 0,
      nextCheckpoint: caller.checkpoint, preparations: [], summary: internal.summary ?? 'Saved website pages'
    }
    const storage = createCmsGraphStorage(cmsGraphEnvironment(principal), snapshot)
    const base = await checkpointStage('base', () => readBase(snapshot, storage), timing)
    const artifactBytes = await checkpointStage('artifacts', () => readArtifacts(snapshot, storage, base), timing)
    timing.artifactsRead = artifactBytes.length
    const nextCheckpoint = await checkpointStage('candidate', () => storage.readCheckpoint({ id: input.nextCheckpoint.checkpointId, digest: input.nextCheckpoint.digest, object_key: input.nextCheckpoint.objectKey }), timing)
    const { candidateId: _candidateId, candidateDigest: _candidateDigest, preparations: _preparations, ...request } = requestFor(snapshot, input)
    const proof = await checkpointStage('verify', () => verifyGraph(() => verifyBuilderApplicationCheckpoint({ request, base, artifactBytes, nextCheckpoint })), timing)
    const { receipt, replayed } = await checkpointStage('commit', () => commitPreparedGraph({ snapshot, input, proof, preparations: [], mode, caller, history: internal.history, pageCount: (nextCheckpoint.manifest as { pages: unknown[] }).pages.length }, principal, deps), timing)
    outcome = replayed ? 'replayed' : 'committed'
    return receipt
  } finally {
    logCheckpointTiming(timing, mode, outcome)
  }
}

/** Native history restore retains today's accepted graph and independent records. */
export async function coordinateCmsGraphRestore(raw: unknown, principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}) {
  if (principal.source === 'customer-session') throw denyCustomerGraphOperation()
  const body = PageStudioHistoryMutationSchema.parse(raw)
  if (body.action !== 'restore') throw cmsGraphConflict('Only restore changes the accepted checkpoint.')
  const snapshot = await readCmsGraphSnapshot(principal, deps)
  const role = snapshot.actor.kind === 'agency-user' ? 'agency' : snapshot.actor.kind === 'customer-user' ? 'customer' : 'client'
  const operationKey = `history:${role}:${snapshot.actor.userId}:${body.requestId}`
  const selected = await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: graphCheckpointMutation(principal) }, async (db) => {
    const current = await snapshotInTransaction(db, snapshot.scope, principal)
    const receipt = (await db.query<{ metadata: { request: unknown, checkpointId: string } }>(
      'SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4 AND action=\'draft.history.saved\'',
      [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, operationKey]
    )).rows[0]?.metadata
    if (receipt) {
      if (!cmsEqual(receipt.request, body)) throw cmsGraphConflict()
      return { receipt: { checkpointId: receipt.checkpointId, currentCheckpointId: current.checkpoint.id, isCurrent: current.checkpoint.id === receipt.checkpointId }, source: null }
    }
    if (!cmsEqual(snapshot, current) || body.expectedCheckpointId !== current.checkpoint.id) throw cmsGraphConflict()
    const source = (await db.query<{ id: string, digest: string, object_key: string }>(
      'SELECT id,digest,object_key FROM page_studio_checkpoints WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4',
      [snapshot.scope.tenantId, snapshot.scope.clientId, snapshot.scope.siteId, body.checkpointId]
    )).rows[0]
    if (!source) throw cmsGraphConflict('Saved checkpoint unavailable.')
    return { receipt: null, source }
  }, deps)
  if (selected.receipt) return selected.receipt
  const env = cmsGraphEnvironment(principal), storage = createCmsGraphStorage(env, snapshot)
  const saved = await storage.readCheckpoint(selected.source!), current = await storage.readCheckpoint(snapshot.checkpoint)
  const manifest = structuredClone(saved.manifest) as Record<string, unknown>
  const currentManifest = current.manifest as Record<string, unknown>
  for (const key of ['builderLibrary', 'builderApplication']) {
    if (Object.hasOwn(currentManifest, key)) manifest[key] = structuredClone(currentManifest[key])
    else if (key === 'builderLibrary') delete manifest.builderLibrary
    else delete manifest.builderApplication
  }
  const checkpointId = `restore_${await collectionDigest([snapshot.scope, snapshot.actor.userId, body])}`
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as CandidateCheckpointBucket | undefined
  if (!bucket?.get || !bucket.put) throw cmsGraphConflict('Checkpoint storage unavailable.')
  const checkpoint = await persistCandidateCheckpoint({ checkpointId, manifest, digest: await collectionDigest(manifest),
    scope: { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId }, userId: snapshot.actor.userId }, bucket)
  const receipt = await coordinateCmsGraphCheckpoint({ checkpoint, expectedCheckpointId: body.expectedCheckpointId }, principal, deps,
    { mode: 'restore', idempotencyKey: operationKey, history: body })
  return { checkpointId: receipt.checkpointId, currentCheckpointId: receipt.currentCheckpointId, isCurrent: receipt.isCurrent }
}

export { lookupCmsGraphOperation } from '~~/server/utils/pageStudio/cmsGraphRead'
