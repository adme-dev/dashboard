import { randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { builderActionResultKey, BuilderActionExecutionIdentitySchema, BuilderActionResultEnvelopeSchema, BuilderActionResultPinSchema } from '~~/shared/pageStudio/actionInvocation'
import { BuilderArtifactPinSchema, CmsObjectPinSchema, CmsStorageTargetSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { verifyBuilderPublishedFormInput } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
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
const rowSchema = z.object({
  identity_digest: digest, identity: identitySchema, secret_hash: digest,
  execution: BuilderActionExecutionIdentitySchema,
  state: z.enum(['dispatch_claimed', 'result_ready', 'execution_failed', 'committed', 'rejected']),
  final_receipt: z.unknown()
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
  const rows = (await db.query('SELECT identity_digest,identity,secret_hash,execution,state,final_receipt FROM page_studio_public_action_invocations WHERE scope_key=$1 AND release_environment=$2 AND intent_id=$3 FOR UPDATE', [contentScopeKey(snapshot.contentScope), snapshot.releaseEnvironment, identity.intentId])).rows
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
  return { context, artifactBytes: artifact.bytes, input: verified.input }
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
