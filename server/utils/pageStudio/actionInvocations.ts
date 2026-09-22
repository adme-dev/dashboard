import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest, CollectionRecordSchema } from '~~/shared/pageStudio/collectionApi'
import { ActionInvocationRequestSchema, ActionInvocationContextSchema, BuilderActionExecutionIdentitySchema, BuilderActionResultEnvelopeSchema, BuilderActionResultPinSchema, type ActionInvocationContext, type BuilderActionExecutionIdentity } from '~~/shared/pageStudio/actionInvocation'
import { contentScopeKey, CmsNativeCommitSchema, type CmsObjectPin } from '~~/shared/pageStudio/cmsManaged'
import { verifyBuilderActionInput, verifyBuilderActionResult, projectBuilderActionRecord } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import { updatePageStudioAiUsageInTransaction } from './aiUsage'
import { cmsEqual, cmsUnavailable, lockCmsContext, decodeCmsObject, readAcceptedCmsObject, listAcceptedCmsRecords } from './cmsVisibility'
import { verifyCmsPreparation, commitVerifiedManagedCmsInTransaction, CmsManagedCommitReceiptSchema, type CmsPreparationReader } from './cmsCommits'
import type { PageStudioControlQueryClient } from './controlStore'

type Principal = Extract<Parameters<typeof withCmsCommitAuthority>[0]['principal'], { source: 'studio-session' }>
type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const RUNTIME_DIGEST = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
const encoder = new TextEncoder()
const runDefault: RunTransaction = work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient))
const State = z.enum(['dispatch_claimed', 'result_ready', 'execution_failed', 'committed', 'rejected'])
const FinalReceipt = z.object({ formatVersion: z.literal(1), invocationId: z.uuid(), identityDigest: z.string().regex(/^[a-f0-9]{64}$/), result: BuilderActionResultPinSchema, outputDigest: z.string().regex(/^[a-f0-9]{64}$/), cms: CmsManagedCommitReceiptSchema.nullable() }).strict()
const Row = z.object({ identity_digest: z.string(), identity: z.unknown(), execution: BuilderActionExecutionIdentitySchema, state: State, result_pin: BuilderActionResultPinSchema.nullable(), result_digest: z.string().nullable(), final_receipt: FinalReceipt.nullable() })
type InvocationRow = z.infer<typeof Row>
type Dependencies = { runTransaction?: RunTransaction }
const key = (context: ActionInvocationContext, intentId: string) => [contentScopeKey(context.scope), intentId]
function assertPrincipal(context: ActionInvocationContext, principal: Principal) {
  const c = principal.claims, s = context.scope
  if (principal.source !== 'studio-session' || c.tenantId !== s.tenantId || c.clientId !== s.clientId || c.siteId !== s.siteId || s.businessId !== s.clientId) throw cmsUnavailable()
}
async function identity(request: z.infer<typeof ActionInvocationRequestSchema>, principal: Principal, brokerId: string) {
  assertPrincipal(request.context, principal)
  const body = { request, principal: { source: principal.source, claims: principal.claims }, brokerId }
  return { body, digest: await collectionDigest(body) }
}
async function row(db: PageStudioControlQueryClient, context: ActionInvocationContext, intentId: string) {
  const rows = (await db.query('SELECT identity_digest,identity,execution,state,result_pin,result_digest,final_receipt FROM page_studio_action_invocations WHERE scope_key=$1 AND intent_id=$2 FOR UPDATE', key(context, intentId))).rows
  if (rows.length > 1) throw cmsUnavailable()
  return rows[0] ? Row.parse(rows[0]) : null
}
function checkIdentity(saved: InvocationRow, expected: Awaited<ReturnType<typeof identity>>) {
  if (saved.identity_digest !== expected.digest || !cmsEqual(saved.identity, expected.body) || saved.execution.identityDigest !== expected.digest) throw new Error('Action invocation identity conflict')
  if (saved.final_receipt && (saved.final_receipt.identityDigest !== expected.digest || saved.final_receipt.invocationId !== saved.execution.invocationId || !cmsEqual(saved.final_receipt.result, saved.result_pin))) throw cmsUnavailable()
}
async function currentPin(db: PageStudioControlQueryClient, context: Awaited<ReturnType<typeof lockCmsContext>>, kind: 'content' | 'record', collectionId = '', recordId = '') {
  const rows = (await db.query(`SELECT o.* FROM page_studio_cms_objects o WHERE o.scope_key=$1 AND o.generation=$2 AND o.kind=$3 AND o.collection_id=$4 AND o.record_id=$5 AND (${kind === 'content' ? 'o.id=$6::uuid' : `EXISTS(SELECT 1 FROM page_studio_cms_record_heads h WHERE h.scope_key=o.scope_key AND h.generation=o.generation AND h.collection_id=o.collection_id AND h.record_id=o.record_id AND h.object_id=o.id) AND $6::uuid IS NULL`})`, [context.state.scope_key, context.state.active_generation, kind, collectionId, recordId, kind === 'content' ? context.state.current_content_id : null])).rows
  if (rows.length > 1) throw cmsUnavailable()
  return rows[0] ? decodeCmsObject(rows[0], context).pin : null
}
/** All statements are local native SQL. Exact selected bases, not MAX history. */
async function assertContext(db: PageStudioControlQueryClient, expected: ActionInvocationContext) {
  const context = await lockCmsContext(db, expected.scope)
  const checkpoints = (await db.query('SELECT c.id,c.digest FROM page_studio_sites s JOIN page_studio_checkpoints c ON c.id=s.current_checkpoint_id AND c.tenant_id=s.tenant_id AND c.client_id=s.client_id AND c.site_id=s.id WHERE s.tenant_id=$1 AND s.client_id=$2 AND s.id=$3', [expected.scope.tenantId, expected.scope.clientId, expected.scope.siteId])).rows
  if (context.state.active_generation !== expected.generation || context.state.freeze_digest !== expected.freezeDigest || !cmsEqual(context.state.target, expected.target) || !cmsEqual({ id: context.application.id, digest: context.application.digest }, expected.expectedApplication) || !cmsEqual(checkpoints[0] ?? null, expected.expectedCheckpoint) || !context.application.manifest.actions.some(pin => cmsEqual(pin, expected.action)) || !cmsEqual(await currentPin(db, context, 'content'), expected.expectedContent)) throw cmsUnavailable()
  for (const pin of expected.expectedSchemas) {
    const accepted = await readAcceptedCmsObject(db, { scope: expected.scope, kind: 'schema', collectionId: pin.collectionId })
    if (!cmsEqual(accepted.pin, pin)) throw cmsUnavailable()
  }
  for (const record of expected.expectedRecords) if (!cmsEqual(await currentPin(db, context, 'record', record.collectionId, record.recordId), record.base)) throw cmsUnavailable()
  return context
}
function authority(context: ActionInvocationContext, principal: Principal, db: PageStudioControlQueryClient, work: () => Promise<unknown>, collections = false) {
  return withCmsCommitAuthority({ scope: context.scope, principal, mutation: collections ? 'collection-record' : 'action-execution' }, work, { runTransaction: callback => callback(db) })
}
function operation(intentId: string) {
  return `action-execution:${intentId}`
}
async function usage(db: PageStudioControlQueryClient, request: z.infer<typeof ActionInvocationRequestSchema>, principal: Principal, digest: string, outcome?: 'succeeded' | 'failed') {
  return updatePageStudioAiUsageInTransaction(db, { action: outcome ? 'settle' : 'reserve', ...(outcome ? { outcome } : {}), kind: 'action-execution', operationId: operation(request.intentId), fingerprint: digest }, principal.claims, request.context.scope.environment)
}
/** Internal service adapter only. No HTTP endpoint or browser dispatch token. */
export async function admitActionInvocation(raw: unknown, principal: Principal, dependencies: Dependencies & { brokerId: string, readArtifact: () => Promise<string>, readObject?: (pin: CmsObjectPin) => Promise<unknown>, input: unknown }) {
  const request = ActionInvocationRequestSchema.parse(raw), context = request.context
  if (context.runtimeDigest !== RUNTIME_DIGEST) throw cmsUnavailable()
  const expected = await identity(request, principal, dependencies.brokerId)
  const replay = await (dependencies.runTransaction ?? runDefault)(async (db) => {
    let prior: { dispatchGranted: false, state: z.infer<typeof State>, execution: BuilderActionExecutionIdentity, receipt: unknown, current?: boolean } | null = null
    await authority(context, principal, db, async () => {
      const saved = await row(db, context, request.intentId)
      if (saved) {
        checkIdentity(saved, expected)
        prior = { dispatchGranted: false, state: saved.state, execution: saved.execution, receipt: saved.final_receipt, current: await invocationCurrent(db, request.context, saved) }
      }
    })
    return prior
  })
  if (replay) return replay
  const verified = await verifyBuilderActionInput({ scope: context.scope, actionPin: context.action, artifactBytes: await dependencies.readArtifact(), input: dependencies.input })
  const reads = await actionData(context, principal, verified, dependencies)
  if (context.inputDigest !== await collectionDigest(verified.input) || context.dataDigest !== await collectionDigest(reads.data)) throw cmsUnavailable()
  const contextDigest = await collectionDigest(context)
  return (dependencies.runTransaction ?? runDefault)(async (db) => {
    await db.query('SET LOCAL lock_timeout=\'3s\'')
    // Same existing order: site -> usage advisory -> session authority. Rollback
    // removes both reservation and invocation when later native admission fails.
    const reserved = await usage(db, request, principal, expected.digest)
    let result!: { dispatchGranted: boolean, state: z.infer<typeof State>, execution: BuilderActionExecutionIdentity, receipt: unknown, current?: boolean, input?: unknown, data?: unknown }
    await authority(context, principal, db, async () => {
      const saved = await row(db, context, request.intentId)
      if (saved) {
        checkIdentity(saved, expected)
        result = { dispatchGranted: false, state: saved.state, execution: saved.execution, receipt: saved.final_receipt, current: await invocationCurrent(db, request.context, saved) }
        return
      }
      if (!reserved.admitted) throw new Error('Usage exists without an invocation; execution remains unresolved')
      await assertContext(db, context)
      if (!cmsEqual(await reads.snapshot(db), reads.metadata)) throw cmsUnavailable()
      const execution = BuilderActionExecutionIdentitySchema.parse({ formatVersion: 1, scope: context.scope, intentId: request.intentId, invocationId: randomUUID(), claimId: randomUUID(), brokerId: dependencies.brokerId, identityDigest: expected.digest, action: context.action, runtimeDigest: context.runtimeDigest, inputDigest: context.inputDigest, dataDigest: context.dataDigest, contextDigest })
      if (context.expectedSchemas.length) await authority(context, principal, db, async () => {
        await assertContext(db, context)
      }, true)
      await db.query('INSERT INTO page_studio_action_invocations(scope_key,intent_id,invocation_id,claim_id,broker_id,identity_digest,identity,execution) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [...key(context, request.intentId), execution.invocationId, execution.claimId, execution.brokerId, expected.digest, expected.body, execution])
      result = { dispatchGranted: true, state: 'dispatch_claimed', execution, receipt: null, input: verified.input, data: reads.data }
    })
    return result
  })
}
async function resultProof(context: ActionInvocationContext, execution: BuilderActionExecutionIdentity, readResult: (key: string) => Promise<string>) {
  const objectKey = `builder-action-results/v1/${await collectionDigest(JSON.parse(contentScopeKey(context.scope)))}/${execution.invocationId}/${execution.claimId}.json`
  const bytes = await readResult(objectKey)
  if (encoder.encode(bytes).byteLength > 150_000) throw cmsUnavailable()
  const value = BuilderActionResultEnvelopeSchema.parse(JSON.parse(bytes))
  if (!cmsEqual(value.execution, execution) || collectionCanonical(value) !== bytes) throw cmsUnavailable()
  if (value.result.json !== undefined && encoder.encode(value.result.json).byteLength > 65_536) throw cmsUnavailable()
  return { value, pin: BuilderActionResultPinSchema.parse({ key: objectKey, sha256: await collectionDigest(value), bytes: encoder.encode(bytes).byteLength }) }
}
export async function readActionInvocation(raw: unknown, principal: Principal, dependencies: Dependencies & { brokerId: string }) {
  const request = ActionInvocationRequestSchema.parse(raw), expected = await identity(request, principal, dependencies.brokerId)
  return (dependencies.runTransaction ?? runDefault)(async (db) => {
    let saved!: InvocationRow
    let current: boolean | undefined
    await authority(request.context, principal, db, async () => {
      const value = await row(db, request.context, request.intentId)
      if (!value) throw cmsUnavailable()
      checkIdentity(value, expected)
      saved = value
      current = await invocationCurrent(db, request.context, value)
    })
    return { dispatchGranted: false as const, state: saved.state, execution: saved.execution, receipt: saved.final_receipt, current }
  })
}
export async function acknowledgeActionResult(raw: unknown, principal: Principal, dependencies: Dependencies & { brokerId: string, readResult: (key: string) => Promise<string> }) {
  const request = ActionInvocationRequestSchema.parse(raw), expected = await identity(request, principal, dependencies.brokerId)
  const saved = await readActionInvocation(request, principal, dependencies)
  const proof = await resultProof(request.context, saved.execution, dependencies.readResult)
  return (dependencies.runTransaction ?? runDefault)(async (db) => {
    await usage(db, request, principal, expected.digest, proof.value.result.status === 'ok' ? 'succeeded' : 'failed')
    let state!: z.infer<typeof State>
    await authority(request.context, principal, db, async () => {
      const current = await row(db, request.context, request.intentId)
      if (!current) throw cmsUnavailable()
      checkIdentity(current, expected)
      if (!cmsEqual(current.execution, proof.value.execution)) throw cmsUnavailable()
      if (current.result_pin) {
        if (!cmsEqual(current.result_pin, proof.pin) || current.result_digest !== proof.pin.sha256) throw cmsUnavailable()
        state = current.state
        return
      }
      state = proof.value.result.status === 'ok' ? 'result_ready' : 'execution_failed'
      await db.query('UPDATE page_studio_action_invocations SET state=$3,result_pin=$4,result_digest=$5,updated_at=clock_timestamp() WHERE scope_key=$1 AND intent_id=$2', [...key(request.context, request.intentId), state, proof.pin, proof.pin.sha256])
    })
    return { state, pin: proof.pin }
  })
}

type CompletionDependencies = Dependencies & {
  brokerId: string
  readResult: (key: string) => Promise<string>
  readArtifact: () => Promise<string>
  input: unknown
  readObject?: (pin: CmsObjectPin) => Promise<unknown>
}
async function verifiedOutput(request: z.infer<typeof ActionInvocationRequestSchema>, principal: Principal, dependencies: CompletionDependencies, effectContext: ActionInvocationContext) {
  const saved = await readActionInvocation(request, principal, dependencies)
  const result = await resultProof(request.context, saved.execution, dependencies.readResult)
  if (result.value.result.status !== 'ok' || !result.value.result.json) throw cmsUnavailable()
  const artifactBytes = await dependencies.readArtifact()
  const action = await verifyBuilderActionInput({ scope: request.context.scope, actionPin: request.context.action, artifactBytes, input: dependencies.input })
  if (await collectionDigest(action.input) !== request.context.inputDigest) throw cmsUnavailable()
  const definitions = []
  const records = []
  const read = async (pin: CmsObjectPin) => {
    if (!dependencies.readObject) throw cmsUnavailable()
    const body = await dependencies.readObject(pin)
    if (await collectionDigest(body) !== pin.sha256 || encoder.encode(collectionCanonical(body)).byteLength !== pin.bytes) throw cmsUnavailable()
    return body
  }
  for (const pin of effectContext.expectedSchemas.filter(pin => action.effects?.permissions.some(permission => permission.collection.id === pin.collectionId))) definitions.push({ kind: 'collection', definition: await read(pin) })
  for (const record of effectContext.expectedRecords) if (record.base) records.push({ record: await read(record.base), sha256: record.base.sha256, actorId: principal.claims.userId, createdAt: new Date(0).toISOString() })
  const output = await verifyBuilderActionResult({ scope: request.context.scope, actionPin: request.context.action, artifactBytes, resultBytes: result.value.result.json, context: { scope: request.context.scope, definitions, records } })
  return { saved, result, output }
}
function effectIdentity(original: ActionInvocationContext, effects: ActionInvocationContext) {
  const { expectedRecords: ignoredOriginal, ...a } = original
  const { expectedRecords: ignoredEffects, ...b } = effects
  if (!cmsEqual(a, b)) throw cmsUnavailable()
}
/** Pin exact output-derived target bases before any remote preparation. Private
 * item bytes are returned to the trusted host only; PostgreSQL retains digests. */
export async function pinActionEffects(raw: unknown, effectRaw: unknown, principal: Principal, dependencies: CompletionDependencies) {
  const request = ActionInvocationRequestSchema.parse(raw)
  let effects = ActionInvocationContextSchema.parse(effectRaw)
  effectIdentity(request.context, effects)
  const expected = await identity(request, principal, dependencies.brokerId)
  const verified = await verifiedOutput(request, principal, dependencies, effects)
  if (!verified.output.commands.length) effects = { ...effects, expectedRecords: [] }
  const items = verified.output.commands.map((command) => {
    const base = effects.expectedRecords.find(record => record.collectionId === command.collectionId && record.recordId === command.recordId)
    const schema = effects.expectedSchemas.find(pin => pin.collectionId === command.collectionId)
    if (!base || !schema || (base.base?.version ?? 0) !== command.expectedRevision || schema.version !== command.schemaVersion) throw cmsUnavailable()
    return { kind: 'record' as const, version: command.expectedRevision + 1, expectedBase: base.base, schema, body: { scope: effects.scope, collectionId: command.collectionId, id: command.recordId, revision: command.expectedRevision + 1, schemaVersion: command.schemaVersion, archived: command.archived, values: command.values } }
  })
  if (items.length !== effects.expectedRecords.length) throw cmsUnavailable()
  const proof = { context: effects, itemsDigest: await collectionDigest(items), resultDigest: verified.result.pin.sha256 }
  await (dependencies.runTransaction ?? runDefault)(async (db) => {
    await authority(request.context, principal, db, async () => {
      const saved = await row(db, request.context, request.intentId)
      if (!saved) throw cmsUnavailable()
      checkIdentity(saved, expected)
      if (saved.state !== 'result_ready' || !cmsEqual(saved.result_pin, verified.result.pin)) throw cmsUnavailable()
      await assertContext(db, request.context)
      const work = async () => {
        await assertContext(db, effects)
        const previous = (await db.query<{ effect_identity: unknown }>('SELECT effect_identity FROM page_studio_action_invocations WHERE scope_key=$1 AND intent_id=$2', key(request.context, request.intentId))).rows[0]!.effect_identity
        if (previous && !cmsEqual(previous, proof)) throw new Error('Action effect bases already pinned')
        if (!previous) await db.query('UPDATE page_studio_action_invocations SET effect_identity=$3 WHERE scope_key=$1 AND intent_id=$2', [...key(request.context, request.intentId), proof])
      }
      if (items.length || effects.expectedSchemas.length) await authority(effects, principal, db, work, true)
      else await work()
    })
  })
  return { items, proof, output: verified.output.result }
}
/** Fresh result and D1 verification occurs before native locks. Final accepted
 * output, metadata/head updates and durable invocation receipt share one commit. */
export async function commitActionInvocation(raw: unknown, principal: Principal, dependencies: CompletionDependencies & { commit?: unknown, readPreparation?: CmsPreparationReader }) {
  const request = ActionInvocationRequestSchema.parse(raw), expected = await identity(request, principal, dependencies.brokerId)
  const commit = dependencies.commit === undefined ? null : CmsNativeCommitSchema.parse(dependencies.commit)
  const effects = commit ? ActionInvocationContextSchema.parse({ ...request.context, expectedRecords: commit.expectedRecords }) : { ...request.context, expectedRecords: [] }
  if (commit) {
    const { action: ignoredAction, runtimeDigest: ignoredRuntime, inputDigest: ignoredInput, dataDigest: ignoredData, ...base } = effects
    const { operationId, preparedDigest: ignoredPrepared, preparedRequestDigest: ignoredRequest, ...received } = commit
    if (!cmsEqual(base, received) || operationId !== `action_${request.intentId}` || !dependencies.readPreparation) throw cmsUnavailable()
  }
  const verified = await verifiedOutput(request, principal, dependencies, effects)
  const prepared = commit ? await verifyCmsPreparation(commit, dependencies.readPreparation!) : null
  if ((verified.output.commands.length > 0) !== Boolean(prepared)) throw cmsUnavailable()
  const items = prepared?.request.items ?? []
  if (prepared && (!cmsEqual(prepared.request.action, request.context.action) || prepared.request.candidateDigest !== null)) throw cmsUnavailable()
  // The independently pinned normalization proof must match these exact bytes.
  const effectProof = { context: effects, itemsDigest: await collectionDigest(items), resultDigest: verified.result.pin.sha256 }
  return (dependencies.runTransaction ?? runDefault)(async (db) => {
    let result!: unknown
    await authority(request.context, principal, db, async () => {
      const saved = await row(db, request.context, request.intentId)
      if (!saved) throw cmsUnavailable()
      checkIdentity(saved, expected)
      if (!cmsEqual(saved.result_pin, verified.result.pin)) throw cmsUnavailable()
      const pinned = (await db.query<{ effect_identity: unknown }>('SELECT effect_identity FROM page_studio_action_invocations WHERE scope_key=$1 AND intent_id=$2', key(request.context, request.intentId))).rows[0]!.effect_identity
      if (!cmsEqual(pinned, effectProof)) throw cmsUnavailable()
      if (saved.state === 'committed') {
        result = { receipt: saved.final_receipt, replayed: true, current: await invocationCurrent(db, request.context, saved) }
        return
      }
      if (saved.state !== 'result_ready') throw cmsUnavailable()
      await assertContext(db, request.context)
      const work = async () => {
        await assertContext(db, effects)
        const cms = commit && prepared ? await commitVerifiedManagedCmsInTransaction(db, commit, principal, prepared) : null
        const receipt = { formatVersion: 1, invocationId: saved.execution.invocationId, identityDigest: expected.digest, result: verified.result.pin, outputDigest: await collectionDigest(verified.output.result), cms: cms?.receipt ?? null }
        await db.query('UPDATE page_studio_action_invocations SET state=\'committed\',final_receipt=$3,updated_at=clock_timestamp() WHERE scope_key=$1 AND intent_id=$2', [...key(request.context, request.intentId), receipt])
        await db.query(`INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,'action.commit','action-invocation',$7,$8,$9)`, [randomUUID(), request.context.scope.tenantId, request.context.scope.clientId, request.context.scope.siteId, principal.claims.userId, principal.claims.role, saved.execution.invocationId, `action:${request.context.scope.environment}:${request.intentId}`, { identityDigest: expected.digest, resultDigest: verified.result.pin.sha256 }])
        result = { receipt, replayed: false, current: true }
      }
      if (prepared || effects.expectedSchemas.length) await authority(effects, principal, db, work, true)
      else await work()
    })
    return result
  })
}

async function actionData(context: ActionInvocationContext, principal: Principal, verified: Awaited<ReturnType<typeof verifyBuilderActionInput>>, dependencies: Dependencies & { readObject?: (pin: CmsObjectPin) => Promise<unknown> }) {
  const declared = [...verified.collections.map(binding => binding.collection), ...(verified.effects?.permissions.map(permission => permission.collection) ?? [])]
  for (const pin of declared) if (declared.some(other => other.id === pin.id && !cmsEqual(other, pin))) throw cmsUnavailable()
  const collections = [...new Map([...verified.collections.map(binding => binding.collection), ...(verified.effects?.permissions.map(permission => permission.collection) ?? [])].map(pin => [pin.id, pin])).values()]
  if (new Set(context.expectedSchemas.map(pin => pin.collectionId)).size !== collections.length || collections.some(pin => !context.expectedSchemas.some(schema => schema.collectionId === pin.id && schema.version === pin.version))) throw cmsUnavailable()
  const snapshot = async (db: PageStudioControlQueryClient) => {
    const schemaObjects = []
    const storedSchemas: ReturnType<typeof decodeCmsObject>[] = []
    const pages = []
    const nativeContext = await lockCmsContext(db, context.scope)
    for (const pin of context.expectedSchemas) schemaObjects.push(await readAcceptedCmsObject(db, { scope: context.scope, kind: 'schema', collectionId: pin.collectionId }))
    for (const binding of verified.collections) {
      const page = await listAcceptedCmsRecords(db, { scope: context.scope, collectionId: binding.collection.id, limit: binding.limit })
      pages.push({ binding: binding.id, items: page.items })
    }
    const selected = new Map(pages.flatMap(page => page.items).map(item => [collectionCanonical([item.pin.collectionId, item.pin.recordId]), item.pin]))
    if (selected.size !== context.expectedRecords.length || context.expectedRecords.some(record => !cmsEqual(selected.get(collectionCanonical([record.collectionId, record.recordId])) ?? null, record.base))) throw cmsUnavailable()
    for (const page of pages) for (const item of page.items) {
      if (!item.schemaObjectId) throw cmsUnavailable()
      if (storedSchemas.some(schema => schema.id === item.schemaObjectId)) continue
      const rows = (await db.query('SELECT * FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND id=$3 AND kind=\'schema\'', [contentScopeKey(context.scope), context.generation, item.schemaObjectId])).rows
      if (rows.length !== 1) throw cmsUnavailable()
      storedSchemas.push(decodeCmsObject(rows[0], nativeContext))
    }
    return { schemaObjects, storedSchemas, pages }
  }
  let metadata!: Awaited<ReturnType<typeof snapshot>>
  await (dependencies.runTransaction ?? runDefault)(async (db) => {
    await authority(context, principal, db, async () => {
      await assertContext(db, context)
      if (collections.length) await authority(context, principal, db, async () => {
        metadata = await snapshot(db)
      }, true)
      else metadata = await snapshot(db)
    })
  })
  let bytes = 0
  const read = async (pin: CmsObjectPin) => {
    if (!dependencies.readObject) throw cmsUnavailable()
    const value = await dependencies.readObject(pin)
    const raw = collectionCanonical(value)
    bytes += encoder.encode(raw).byteLength
    if (bytes > 1_000_000 || await collectionDigest(value) !== pin.sha256 || encoder.encode(raw).byteLength !== pin.bytes) throw cmsUnavailable()
    return value
  }
  const definitions = new Map<string, unknown>()
  for (const item of metadata.schemaObjects) {
    const definition = await read(item.pin)
    const artifact = { kind: 'collection', definition }
    if (await collectionDigest(artifact) !== collections.find(pin => pin.id === item.pin.collectionId)?.sha256) throw cmsUnavailable()
    definitions.set(item.pin.collectionId, definition)
  }
  const storedDefinitions = new Map<string, unknown>()
  for (const schema of metadata.storedSchemas) storedDefinitions.set(schema.id, await read(schema.pin))
  const data: Record<string, Array<{ id: string, values: Record<string, string | number | boolean> }>> = {}
  for (const binding of verified.collections) {
    const page = metadata.pages.find(page => page.binding === binding.id)!
    data[binding.id] = []
    for (const item of page.items) {
      const raw = await read(item.pin)
      const record = CollectionRecordSchema.parse(raw)
      const definition = definitions.get(binding.collection.id)
      data[binding.id]!.push({ id: record.id, values: projectBuilderActionRecord({ storedDefinition: storedDefinitions.get(item.schemaObjectId!), pinnedDefinition: definition, currentDefinition: definition, values: record.values, fields: binding.fields }) })
    }
  }
  if (encoder.encode(collectionCanonical(data)).byteLength > 65_536) throw cmsUnavailable()
  return { data, snapshot, metadata }
}

async function invocationCurrent(db: PageStudioControlQueryClient, context: ActionInvocationContext, saved: InvocationRow) {
  if (!saved.final_receipt) return undefined
  const records = new Map(context.expectedRecords.map(record => [collectionCanonical([record.collectionId, record.recordId]), record]))
  for (const object of saved.final_receipt.cms?.objects ?? []) {
    if (object.pin.kind !== 'record') throw cmsUnavailable()
    records.set(collectionCanonical([object.pin.collectionId, object.pin.recordId]), { collectionId: object.pin.collectionId, recordId: object.pin.recordId, base: object.pin })
  }
  try {
    await assertContext(db, { ...context, expectedRecords: [...records.values()] })
    return true
  } catch (error) {
    if (error instanceof Error && error.message === cmsUnavailable().message) return false
    throw error
  }
}

/** Native-only lookup for the broker: recover the ORIGINAL immutable request
 * before touching today's accepted heads or remote artifacts. No dispatch grant. */
export async function lookupActionInvocation(input: { intentId: string, action: unknown, inputDigest: string }, principal: Principal, dependencies: Dependencies & { brokerId: string }) {
  const scope = ActionInvocationContextSchema.shape.scope.parse({ tenantId: principal.claims.tenantId, clientId: principal.claims.clientId, businessId: principal.claims.clientId, siteId: principal.claims.siteId, environment: principal.env.PAGE_STUDIO_CONTENT_ENVIRONMENT })
  z.uuid().parse(input.intentId)
  return withCmsCommitAuthority({ scope, principal, mutation: 'action-execution' }, async (db) => {
    const values = (await db.query('SELECT identity_digest,identity,execution,state,result_pin,result_digest,final_receipt,effect_identity FROM page_studio_action_invocations WHERE scope_key=$1 AND intent_id=$2 FOR UPDATE', [contentScopeKey(scope), input.intentId])).rows
    if (!values.length) return null
    if (values.length !== 1) throw cmsUnavailable()
    const saved = Row.parse(values[0])
    const stored = z.object({ request: ActionInvocationRequestSchema, principal: z.unknown(), brokerId: z.string() }).strict().parse(saved.identity)
    if (!cmsEqual(stored.request.context.action, input.action) || stored.request.context.inputDigest !== input.inputDigest) throw new Error('Action invocation identity conflict')
    checkIdentity(saved, await identity(stored.request, principal, dependencies.brokerId))
    return { request: stored.request, state: saved.state, receipt: saved.final_receipt, current: await invocationCurrent(db, stored.request.context, saved), effectIdentity: (values[0] as { effect_identity: unknown }).effect_identity }
  }, { runTransaction: dependencies.runTransaction })
}
/** Private coordinator composition only. This derives byte-verified public
 * projection from accepted native selections; it does not issue a dispatch. */
export const projectActionInvocationData = actionData
