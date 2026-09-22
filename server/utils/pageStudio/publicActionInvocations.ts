import { randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { builderActionResultKey, BuilderActionExecutionIdentitySchema, BuilderActionResultEnvelopeSchema, BuilderActionResultPinSchema } from '~~/shared/pageStudio/actionInvocation'
import { BuilderArtifactPinSchema, CmsObjectPinSchema, CmsStorageTargetSchema, CmsPreparationSchema, cmsPreparationActorId, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { verifyBuilderPublishedFormInput, verifyBuilderActionResult } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { verifyCmsPreparation, insertVerifiedCmsObjects, CmsManagedCommitReceiptSchema } from './cmsCommits'
import { createActionStorage } from './actionStorage'
import { assertPageStudioAiAllowanceAvailable } from './aiAllowance'
import { cmsEqual, readAcceptedCmsObject } from './cmsVisibility'
import { PublishedFeatureRequestSchema, publishedFeatureDenied, withPublishedActionAuthority, type PublishedFeatureSnapshot } from './publishedFeatureAuthority'
import { readPublishedFeatureRecovery } from './publishedFeatureProjection'
import { assertPublicFormChallenge, verifyPublicFormChallenge } from './publicFormChallenge'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import type { PageStudioControlQueryClient } from './controlStore'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const publication = PublishedFeatureRequestSchema.extend({ activationId: z.uuid(), pointerVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()
export const PublicActionFormRequestSchema = z.object({
  version: z.literal(1), publication, pageId: id, formId: id, formDigest: digest,
  intentId: z.uuid(), receiptSecret: digest,
  clientAddress: z.union([z.ipv4(), z.ipv6()]),
  fields: z.record(z.string().min(1).max(128), z.string().max(10_000)).refine(fields => Object.keys(fields).length <= 32 && new TextEncoder().encode(collectionCanonical(fields)).byteLength <= 65_536),
  turnstileToken: z.string().min(1).max(2048).optional()
}).strict()
const contextSchema = z.object({
  scope: PageStudioContentScopeSchema, generation: z.uuid(), target: CmsStorageTargetSchema, freezeDigest: digest,
  publication, releaseEnvironment: z.enum(['staging', 'production']),
  pageId: id, formId: id, formDigest: digest, bindingDigest: digest,
  action: BuilderArtifactPinSchema.extend({ kind: z.literal('action') }).strict(),
  expectedSchemas: z.array(CmsObjectPinSchema).max(16),
  runtimeDigest: digest, inputDigest: digest, dataDigest: digest
}).strict()
const requestIdentitySchema = z.object({
  version: z.literal(1), publication, pageId: id, formId: id, formDigest: digest,
  intentId: z.uuid(), secretHash: digest, fieldsDigest: digest
}).strict()
const identitySchema = z.object({ request: requestIdentitySchema, context: contextSchema }).strict()
const receiptSchema = z.object({ version: z.literal(1), submissionId: z.uuid(), state: z.literal('received'), duplicate: z.boolean() }).strict()
const rowSchema = z.object({
  identity_digest: digest, identity: identitySchema, secret_hash: digest,
  execution: BuilderActionExecutionIdentitySchema,
  state: z.enum(['dispatch_claimed', 'result_ready', 'execution_failed', 'committed', 'rejected']),
  final_receipt: receiptSchema.nullable(), result_pin: BuilderActionResultPinSchema.nullable(), result_digest: digest.nullable(), effect_identity: z.unknown()
})
type Context = z.infer<typeof contextSchema>
type Request = z.infer<typeof PublicActionFormRequestSchema>
type Identity = z.infer<typeof requestIdentitySchema>
type Saved = z.infer<typeof rowSchema>
const brokerId = 'page-studio-published-form-host'
function featureRequest(body: Request) {
  const { activationId: _activation, pointerVersion: _pointer, ...value } = body.publication
  return value
}
function assertPublication(body: Request, snapshot: PublishedFeatureSnapshot) {
  if (!cmsEqual(body.publication, { ...snapshot.request, activationId: snapshot.release.activationId, pointerVersion: snapshot.release.pointerVersion })) throw publishedFeatureDenied()
}
async function assertCurrent(db: PageStudioControlQueryClient, snapshot: PublishedFeatureSnapshot, context: Context) {
  if (!cmsEqual(context.scope, snapshot.contentScope) || context.generation !== snapshot.seal.generation
    || !cmsEqual(context.target, snapshot.seal.target) || context.freezeDigest !== snapshot.seal.freezeDigest
    || context.releaseEnvironment !== snapshot.releaseEnvironment || context.runtimeDigest !== snapshot.seal.runtimeDigest
    || !cmsEqual(context.publication, { ...snapshot.request, activationId: snapshot.release.activationId, pointerVersion: snapshot.release.pointerVersion })) throw publishedFeatureDenied()
  // The sealed release selects the action. Only its required write schemas must
  // remain current; unrelated draft edits do not invalidate a published form.
  for (const pin of context.expectedSchemas) {
    const current = await readAcceptedCmsObject(db, { scope: context.scope, kind: 'schema', collectionId: pin.collectionId })
    if (!cmsEqual(current.pin, pin)) throw publishedFeatureDenied()
  }
}
async function retained(db: PageStudioControlQueryClient, snapshot: PublishedFeatureSnapshot, identity: Identity): Promise<Saved | null> {
  const rows = (await db.query('SELECT identity_digest,identity,secret_hash,execution,state,final_receipt,result_pin,result_digest,effect_identity FROM page_studio_public_action_invocations WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3 FOR UPDATE', [contentScopeKey(snapshot.contentScope), snapshot.releaseEnvironment, identity.intentId])).rows
  if (!rows.length) return null
  if (rows.length !== 1) throw publishedFeatureDenied()
  const saved = rowSchema.parse(rows[0])
  if (!timingSafeEqual(Buffer.from(saved.secret_hash, 'hex'), Buffer.from(identity.secretHash, 'hex'))
    || !cmsEqual(saved.identity.request, identity) || saved.identity_digest !== await collectionDigest(saved.identity)
    || saved.execution.identityDigest !== saved.identity_digest || saved.execution.brokerId !== brokerId
    || saved.execution.intentId !== identity.intentId || saved.execution.contextDigest !== await collectionDigest(saved.identity.context)
    || !cmsEqual(saved.execution.scope, snapshot.contentScope) || !cmsEqual(saved.execution.action, saved.identity.context.action)
    || saved.execution.runtimeDigest !== saved.identity.context.runtimeDigest || saved.execution.inputDigest !== saved.identity.context.inputDigest
    || saved.execution.dataDigest !== saved.identity.context.dataDigest) throw publishedFeatureDenied()
  if ((saved.state === 'committed') !== (saved.final_receipt !== null)
    || (saved.final_receipt && (saved.final_receipt.submissionId !== saved.execution.invocationId || saved.final_receipt.duplicate))) throw publishedFeatureDenied()
  await assertCurrent(db, snapshot, saved.identity.context)
  return saved
}
async function resolveForm(body: Request, snapshot: PublishedFeatureSnapshot, env: Record<string, unknown>) {
  const recovered = await readPublishedFeatureRecovery(snapshot, env)
  const eligible = recovered.forms.find(form => form.pageId === body.pageId && form.formId === body.formId)
  if (!eligible?.publicCreateEligible || eligible.formDigest !== body.formDigest) throw publishedFeatureDenied()
  const pages = z.array(z.object({ id, route: z.string(), visibility: z.string(), forms: z.array(z.unknown()).optional() })).parse(recovered.checkpoint.pages)
  const page = pages.find(page => page.id === body.pageId && page.route === body.publication.pageRoute && page.visibility === 'public')
  const form = page?.forms?.find(form => z.object({ id }).parse(form).id === body.formId)
  if (!form) throw publishedFeatureDenied()
  const artifacts = z.array(z.object({ pin: BuilderArtifactPinSchema, bytes: z.string() })).parse(recovered.bundle.artifacts)
  const artifact = artifacts.find(item => cmsEqual(item.pin, eligible.action))
  if (!artifact) throw publishedFeatureDenied()
  const verified = await verifyBuilderPublishedFormInput({ scope: snapshot.contentScope, actionPin: eligible.action, artifactBytes: artifact.bytes, form, fields: body.fields })
  if (verified.formDigest !== body.formDigest || verified.bindingDigest !== eligible.bindingDigest || !verified.effects) throw publishedFeatureDenied()
  const schemas = z.array(z.object({ pin: CmsObjectPinSchema, bytes: z.string() })).parse(recovered.bundle.schemas)
  const expectedSchemas = verified.effects.permissions.map((permission) => {
    const selected = schemas.find(item => item.pin.kind === 'schema' && item.pin.collectionId === permission.collection.id && item.pin.version === permission.collection.version)
    if (!selected) throw publishedFeatureDenied()
    return selected.pin
  })
  const context = contextSchema.parse({
    scope: snapshot.contentScope, generation: snapshot.seal.generation, target: snapshot.seal.target, freezeDigest: snapshot.seal.freezeDigest,
    publication: body.publication, releaseEnvironment: snapshot.releaseEnvironment, pageId: body.pageId, formId: body.formId,
    formDigest: verified.formDigest, bindingDigest: verified.bindingDigest, action: verified.action, expectedSchemas,
    runtimeDigest: snapshot.seal.runtimeDigest, inputDigest: await collectionDigest(verified.input), dataDigest: await collectionDigest({})
  })
  const definitions = expectedSchemas.map(pin => ({ kind: 'collection' as const, definition: JSON.parse(schemas.find(item => cmsEqual(item.pin, pin))!.bytes) }))
  return { context, artifactBytes: artifact.bytes, input: verified.input, definitions }
}

async function requestIdentity(body: Request) {
  return requestIdentitySchema.parse({ version: body.version, publication: body.publication, pageId: body.pageId, formId: body.formId,
    formDigest: body.formDigest, intentId: body.intentId, secretHash: await collectionDigest({ secret: body.receiptSecret }), fieldsDigest: await collectionDigest(body.fields) })
}

/** Private host only. Admission is durable before dispatch; replays can only
 * recover the original execution. CAPTCHA and immutable byte reads run outside
 * SQL, followed by fresh publication/schema/package checks in the claim txn.
 * No publisher identity, human permission, guest output or browser grant enters. */
export async function admitPublishedFormAction(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies & { fetch?: typeof globalThis.fetch } = {}) {
  const body = PublicActionFormRequestSchema.parse(raw)
  const identity = await requestIdentity(body)
  const initial = await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    return { snapshot, saved: await retained(db, snapshot, identity) }
  }, dependencies)
  const resolved = await resolveForm(body, initial.snapshot, env)
  const fullIdentity = { request: identity, context: resolved.context }, identityDigest = await collectionDigest(fullIdentity)
  const challengeIdentity = { hostname: body.publication.hostname, clientAddress: body.clientAddress, identityDigest }
  const challenge = initial.saved ? null : await verifyPublicFormChallenge(challengeIdentity, body.turnstileToken, env, dependencies)
  const admission = await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    await assertCurrent(db, snapshot, resolved.context)
    const saved = await retained(db, snapshot, identity)
    if (saved) {
      if (saved.identity_digest !== identityDigest || !cmsEqual(saved.identity, fullIdentity)) throw publishedFeatureDenied()
      return { dispatchGranted: false, state: saved.state, execution: saved.execution, receipt: saved.final_receipt }
    }
    if (!challenge || initial.saved) throw publishedFeatureDenied()
    const { challengeDigest } = assertPublicFormChallenge(challenge, challengeIdentity)
    const entitlementId = (await db.query<{ entitlement_id: string }>('SELECT entitlement_id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3', [snapshot.contentScope.tenantId, snapshot.contentScope.clientId, snapshot.contentScope.siteId])).rows[0]?.entitlement_id
    if (!entitlementId) throw publishedFeatureDenied()
    const budget = await assertPageStudioAiAllowanceAvailable(db, { tenantId: snapshot.contentScope.tenantId, clientId: snapshot.contentScope.clientId, entitlementId })
    const execution = BuilderActionExecutionIdentitySchema.parse({ formatVersion: 1, scope: snapshot.contentScope, intentId: body.intentId,
      invocationId: randomUUID(), claimId: randomUUID(), brokerId, identityDigest, action: resolved.context.action,
      runtimeDigest: resolved.context.runtimeDigest, inputDigest: resolved.context.inputDigest, dataDigest: resolved.context.dataDigest, contextDigest: await collectionDigest(resolved.context) })
    await db.query(`INSERT INTO page_studio_public_action_invocations(scope_key,tenant_id,client_id,business_id,site_id,environment,release_environment,
      intent_id,invocation_id,claim_id,broker_id,identity_digest,identity,execution,secret_hash,challenge_digest,release_id,activation_id,pointer_version,entitlement_id,period_start)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::date)`,
    [contentScopeKey(snapshot.contentScope), snapshot.contentScope.tenantId, snapshot.contentScope.clientId, snapshot.contentScope.siteId,
      snapshot.contentScope.environment, snapshot.releaseEnvironment, body.intentId, execution.invocationId, execution.claimId, brokerId,
      identityDigest, fullIdentity, execution, identity.secretHash, challengeDigest, snapshot.release.releaseId, snapshot.release.activationId,
      snapshot.release.pointerVersion, entitlementId, budget.period])
    return { dispatchGranted: true, state: 'dispatch_claimed' as const, execution, receipt: null, input: resolved.input, data: {} }
  }, dependencies)
  return { admission, prepared: { request: { intentId: body.intentId, context: resolved.context }, artifactBytes: resolved.artifactBytes, input: resolved.input } }
}

/** Acknowledgement reads the deterministic private result itself. The host cannot
 * submit output bytes or claim success. A verified engine response settles the
 * charge, but only the later atomic effect commit may issue a received receipt. */
export async function acknowledgePublishedFormAction(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const body = PublicActionFormRequestSchema.parse(raw), identity = await requestIdentity(body)
  const initial = await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    const saved = await retained(db, snapshot, identity)
    if (!saved) throw publishedFeatureDenied()
    return { snapshot, saved }
  }, dependencies)
  const key = await builderActionResultKey(initial.saved.execution)
  const bytes = await createActionStorage(env, initial.snapshot.contentScope, initial.snapshot.seal.target).readResult(key)
  const result = BuilderActionResultEnvelopeSchema.parse(JSON.parse(bytes))
  if (collectionCanonical(result) !== bytes || !cmsEqual(result.execution, initial.saved.execution)) throw publishedFeatureDenied()
  const pin = BuilderActionResultPinSchema.parse({ key, sha256: await collectionDigest(result), bytes: new TextEncoder().encode(bytes).byteLength })
  return await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    const saved = await retained(db, snapshot, identity)
    if (!saved || !cmsEqual(saved.execution, result.execution)) throw publishedFeatureDenied()
    const args = [contentScopeKey(snapshot.contentScope), snapshot.releaseEnvironment, body.intentId]
    const row = (await db.query<{ result_pin: unknown, result_digest: string | null }>('SELECT result_pin,result_digest FROM page_studio_public_action_invocations WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3', args)).rows[0]
    if (!row) throw publishedFeatureDenied()
    if (row.result_pin !== null) {
      if (!cmsEqual(row.result_pin, pin) || row.result_digest !== pin.sha256) throw publishedFeatureDenied()
      return { state: saved.state, pin }
    }
    if (saved.state !== 'dispatch_claimed') throw publishedFeatureDenied()
    const state = result.result.status === 'ok' ? 'result_ready' : 'execution_failed'
    const quota = result.result.status === 'ok' ? 'succeeded' : 'failed'
    await db.query(`UPDATE page_studio_public_action_invocations SET state=$4,quota_state=$5,settled_at=clock_timestamp(),
      result_pin=$6,result_digest=$7,updated_at=clock_timestamp() WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3`,
    [...args, state, quota, pin, pin.sha256])
    return { state, pin }
  }, dependencies)
}

async function assertNewPublicRecords(db: PageStudioControlQueryClient, context: Context, items: Array<{ body: { collectionId: string, id: string } }>) {
  if (!items.length) return
  const found = await db.query(`SELECT 1 FROM page_studio_cms_objects o
    JOIN jsonb_to_recordset($3::jsonb) AS wanted("collectionId" text,"recordId" text)
      ON o.collection_id=wanted."collectionId" AND o.record_id=wanted."recordId"
    WHERE o.scope_key=$1 AND o.generation=$2 AND o.kind='record' LIMIT 1`,
  [contentScopeKey(context.scope), context.generation, JSON.stringify(items.map(item => ({ collectionId: item.body.collectionId, recordId: item.body.id })))])
  if (found.rows.length) throw publishedFeatureDenied()
}
/** Native completion owns normalization and preparation; the caller supplies
 * neither effect bodies nor a permission proof. All remote work precedes the
 * final transaction. Immutable preparation stays invisible if final authority,
 * create-head checks, audit, object insertion or the receipt update fails. */
export async function completePublishedFormAction(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const body = PublicActionFormRequestSchema.parse(raw), identity = await requestIdentity(body)
  const initial = await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    const saved = await retained(db, snapshot, identity)
    if (!saved) throw publishedFeatureDenied()
    return { snapshot, saved }
  }, dependencies)
  const saved = initial.saved, context = saved.identity.context
  if (saved.final_receipt) return { ...saved.final_receipt, duplicate: true }
  if (saved.state !== 'result_ready') throw publishedFeatureDenied()
  const resolved = await resolveForm(body, initial.snapshot, env)
  if (!cmsEqual(resolved.context, context)) throw publishedFeatureDenied()
  const storage = createActionStorage(env, context.scope, context.target)
  const resultKey = await builderActionResultKey(saved.execution), resultBytes = await storage.readResult(resultKey)
  const envelope = BuilderActionResultEnvelopeSchema.parse(JSON.parse(resultBytes))
  const resultPin = BuilderActionResultPinSchema.parse({ key: resultKey, sha256: await collectionDigest(envelope), bytes: new TextEncoder().encode(resultBytes).byteLength })
  if (!cmsEqual(envelope.execution, saved.execution) || collectionCanonical(envelope) !== resultBytes
    || !cmsEqual(saved.result_pin, resultPin) || saved.result_digest !== resultPin.sha256 || envelope.result.status !== 'ok' || envelope.result.json === undefined) throw publishedFeatureDenied()
  const output = await verifyBuilderActionResult({ scope: context.scope, actionPin: context.action, artifactBytes: resolved.artifactBytes,
    resultBytes: envelope.result.json, context: { scope: context.scope, definitions: resolved.definitions, records: [] } })
  const items = output.commands.map((command) => {
    const schema = context.expectedSchemas.find(pin => pin.collectionId === command.collectionId && pin.version === command.schemaVersion)
    if (!schema || command.type !== 'create' || command.expectedRevision !== 0 || command.archived) throw publishedFeatureDenied()
    return { kind: 'record' as const, version: 1, expectedBase: null, schema,
      body: { scope: context.scope, collectionId: command.collectionId, id: command.recordId, revision: 1, schemaVersion: command.schemaVersion, archived: false, values: command.values } }
  })
  const effectIdentity = { version: 1, result: resultPin, itemsDigest: await collectionDigest(items), outputDigest: await collectionDigest(output.result) }
  const pinnedReceipt = await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    const current = await retained(db, snapshot, identity)
    if (!current || !cmsEqual(current.execution, saved.execution) || !cmsEqual(current.result_pin, resultPin)) throw publishedFeatureDenied()
    if (current.final_receipt) return current.final_receipt
    if (current.state !== 'result_ready' || (current.effect_identity !== null && !cmsEqual(current.effect_identity, effectIdentity))) throw publishedFeatureDenied()
    await assertNewPublicRecords(db, context, items)
    if (current.effect_identity === null) await db.query('UPDATE page_studio_public_action_invocations SET effect_identity=$4 WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3', [contentScopeKey(context.scope), context.releaseEnvironment, body.intentId, effectIdentity])
    return null
  }, dependencies)
  if (pinnedReceipt) return { ...pinnedReceipt, duplicate: true }
  const operationId = `public_${saved.execution.invocationId}`
  const actor = { kind: 'published-form' as const, invocationId: saved.execution.invocationId, activationId: context.publication.activationId,
    releaseId: context.publication.releaseId, pointerVersion: context.publication.pointerVersion, identityDigest: saved.identity_digest }
  let prepared: Awaited<ReturnType<typeof verifyCmsPreparation>> | null = null
  if (items.length) {
    const preparation = CmsPreparationSchema.parse({ formatVersion: 2, scope: context.scope, operationId, actor,
      freezeDigest: context.freezeDigest, candidateDigest: null, action: context.action, items })
    const receipt = await storage.prepare(preparation)
    prepared = await verifyCmsPreparation({ scope: context.scope, target: context.target, freezeDigest: context.freezeDigest, operationId,
      preparedRequestDigest: receipt.requestDigest, preparedDigest: receipt.digest }, storage.readPreparation)
    if (!cmsEqual(prepared.request, preparation) || !cmsEqual(prepared.receipt, receipt)) throw publishedFeatureDenied()
  }
  return await withPublishedActionAuthority(featureRequest(body), env, null, async (db, snapshot) => {
    assertPublication(body, snapshot)
    const current = await retained(db, snapshot, identity)
    if (!current || !cmsEqual(current.execution, saved.execution) || !cmsEqual(current.result_pin, resultPin) || !cmsEqual(current.effect_identity, effectIdentity)) throw publishedFeatureDenied()
    if (current.final_receipt) return { ...current.final_receipt, duplicate: true }
    if (current.state !== 'result_ready') throw publishedFeatureDenied()
    await assertNewPublicRecords(db, context, items)
    const commitId = randomUUID(), auditId = randomUUID(), actorId = cmsPreparationActorId(actor)
    const objects = prepared ? await insertVerifiedCmsObjects(db, snapshot.context, prepared, commitId) : []
    for (const object of objects) {
      if (object.pin.kind !== 'record') throw publishedFeatureDenied()
      // Deliberately no upsert: an existing head is a create conflict, never an update.
      await db.query('INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,$3,$4,$5)',
        [contentScopeKey(context.scope), context.generation, object.pin.collectionId, object.pin.recordId, object.id])
    }
    await db.query(`INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,$5,'published-form','public-action.commit','public-action-invocation',$6,$7,$8)`,
    [auditId, context.scope.tenantId, context.scope.clientId, context.scope.siteId, actorId, saved.execution.invocationId,
      `public-action:${context.releaseEnvironment}:${saved.execution.invocationId}`, { identityDigest: saved.identity_digest, resultDigest: resultPin.sha256, itemsDigest: effectIdentity.itemsDigest, objectCount: objects.length }])
    if (prepared) {
      const bound = { invocationId: saved.execution.invocationId, identityDigest: saved.identity_digest, effectIdentity,
        preparation: { operationId, requestDigest: prepared.receipt.requestDigest, receiptDigest: prepared.receipt.digest } }
      const requestDigest = await collectionDigest(bound)
      const cmsReceipt = CmsManagedCommitReceiptSchema.parse({ formatVersion: 1, commitId, operationId, requestDigest,
        preparedDigest: prepared.receipt.digest, generation: context.generation, application: { id: snapshot.context.application.id, digest: snapshot.context.application.digest }, objects, createdAt: new Date().toISOString() })
      await db.query(`INSERT INTO page_studio_cms_commits(scope_key,generation,id,operation_id,request_digest,prepared_digest,request,result,actor_id,audit_id,tenant_id,client_id,site_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [contentScopeKey(context.scope), context.generation, commitId, operationId, requestDigest, prepared.receipt.digest, bound, cmsReceipt, actorId, auditId, context.scope.tenantId, context.scope.clientId, context.scope.siteId])
    }
    const receipt = receiptSchema.parse({ version: 1, submissionId: saved.execution.invocationId, state: 'received', duplicate: false })
    await db.query(`UPDATE page_studio_public_action_invocations SET state='committed',final_receipt=$4,updated_at=clock_timestamp() WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3`, [contentScopeKey(context.scope), context.releaseEnvironment, body.intentId, receipt])
    return receipt
  }, dependencies)
}
