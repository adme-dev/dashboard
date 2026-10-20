import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { DispatchWorkerIntentSchema } from '../../../shared/pageStudio/managed-transfer-execution'
import { readCustomerRuntimeRecoveryAuthority } from '../../../server/utils/pageStudio/customerSchemaUpgrade'
import { capturePageStudioRpcMethod } from '../../../server/utils/pageStudio/privateRpc'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'
import { operatorProof, type Operator } from './transferControlAuthority'
import { ContentRuntimeRecoveryReviewSchema as Review, ContentRuntimeRecoveryApprovalSchema as Approval, RuntimeGenerationRecordSchema, NativeRuntimeRecoveryCallbackSchema as Callback, NativeRuntimeRecoveryOperatorSchema as OperatorRequest } from './nativeRuntimeRecoveryContract'

const denied = () => createError({ statusCode: 403, statusMessage: 'Current native CMS recovery authority is required.' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Refresh the retained CMS recovery review.' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const Prepared = z.object({ review: Review, authority: z.unknown(), operator: OperatorRequest.shape.operator, operatorProof: z.object({ issuedAt: z.string(), expiresAt: z.string() }).strict() }).strict()
type PreparedReview = z.infer<typeof Prepared>
const Observe = z.object({ original: RuntimeGenerationRecordSchema, replacement: z.string().nullable(), observedAt: z.iso.datetime() }).strict()
async function authority(db: PageStudioQueryClient, siteId: string, requestId: string, operator: Operator) {
  const proof = await operatorProof(db, operator)
  const native = await readCustomerRuntimeRecoveryAuthority(db, siteId, requestId)
  // Operator rows are already locked; finish its time fence after native locks.
  if ((await db.query('SELECT 1 WHERE $1::timestamptz>clock_timestamp()', [proof.expiresAt])).rows.length !== 1) throw denied()
  return { native, operator, operatorProof: proof }
}
async function withAuthority<T>(siteId: string, requestId: string, operator: Operator, run: RunPageStudioTransaction,
  work: (db: PageStudioQueryClient, current: Awaited<ReturnType<typeof authority>>, digest: string) => Promise<T>) {
  return run(async (db) => {
    const current = await authority(db, siteId, requestId, operator), digest = await collectionDigest(current)
    const result = await work(db, current, digest)
    if (!same(current, await authority(db, siteId, requestId, operator))) throw conflict()
    return result
  })
}
async function loadPrepared(db: PageStudioQueryClient, reviewId: string) {
  const rows = (await db.query<{ metadata: unknown, actor_id: string, actor_role: string, site_id: string }>(`SELECT metadata,actor_id,actor_role,site_id FROM page_studio_audit_events
    WHERE action='customer.runtime-recovery.prepared' AND resource_type='content_runtime_recovery' AND resource_id=$1`, [reviewId])).rows
  if (rows.length !== 1) throw denied()
  const row = rows[0]!, saved = Prepared.parse(row.metadata)
  if (saved.review.reviewId !== reviewId || saved.operator.actorId !== row.actor_id || row.actor_role !== 'agency' || saved.review.request.scope.siteId !== row.site_id) throw denied()
  return saved
}
function assertPrepared(saved: PreparedReview, siteId: string, requestId: string, operator: Operator, current: Awaited<ReturnType<typeof authority>>, digest: string) {
  if (saved.review.request.scope.siteId !== siteId || saved.review.requestId !== requestId || !same(saved.operator, operator)
    || !same(saved.authority, current.native) || !same(saved.operatorProof, current.operatorProof) || saved.review.authorityDigest !== digest
    || !same(saved.review.request, current.native.saved.intent)) throw conflict()
}
async function expectedApproval(review: z.infer<typeof Review>) {
  return Approval.parse({ version: 1, reviewId: review.reviewId, attemptId: review.attemptId,
    scopeKey: review.original.scope_key, requestId: review.requestId, operationId: review.request.operationId,
    originalRowDigest: review.originalRowDigest, intentDigest: review.intentDigest, authorityDigest: review.authorityDigest, reviewDigest: await collectionDigest(review) })
}
async function readApproval(db: PageStudioQueryClient, saved: PreparedReview) {
  const rows = (await db.query<{ metadata: unknown, actor_id: string, actor_role: string }>(`SELECT metadata,actor_id,actor_role FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND action='customer.runtime-recovery.applied'
    AND resource_type='content_runtime_recovery' AND resource_id=$4`, [saved.review.request.scope.tenantId, saved.review.request.scope.clientId, saved.review.request.scope.siteId, saved.review.reviewId])).rows
  if (!rows.length) return null
  if (rows.length !== 1 || rows[0]!.actor_role !== 'agency' || rows[0]!.actor_id !== saved.operator.actorId) throw denied()
  const receipt = Approval.parse(rows[0]!.metadata)
  if (!same(receipt, await expectedApproval(saved.review))) throw denied()
  return receipt
}
async function append(db: PageStudioQueryClient, saved: PreparedReview, action: 'prepared' | 'applied', key: string, metadata: unknown) {
  const scope = saved.review.request.scope
  await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
    VALUES($1,$2,$3,$4,'agency',$5,'content_runtime_recovery',$6,$7,$8::jsonb) ON CONFLICT DO NOTHING`,
  [scope.tenantId, scope.clientId, scope.siteId, saved.operator.actorId, `customer.runtime-recovery.${action}`, saved.review.reviewId, key, JSON.stringify(metadata)])
}
function runtime(env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') throw denied()
  const binding = env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER as Record<string, unknown> | undefined
  const read = capturePageStudioRpcMethod(binding, 'observeContentRuntimeRecovery'), create = capturePageStudioRpcMethod(binding, 'createPendingContentRuntimeReplacement'), approve = capturePageStudioRpcMethod(binding, 'approvePendingContentRuntimeReplacement')
  if (!read || !create || !approve) throw denied()
  return { read, create, approve }
}
async function projection(saved: PreparedReview, phase: 'prepared' | 'approval-retained' | 'admitted') {
  return { reviewId: saved.review.reviewId, siteId: saved.review.request.scope.siteId, requestId: saved.review.requestId, operationId: saved.review.request.operationId, reviewDigest: await collectionDigest(saved.review), phase }
}
async function prepare(request: z.infer<typeof OperatorRequest>, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  if (request.reviewId) throw conflict()
  const initial = await withAuthority(request.siteId, request.requestId, request.operator, run, async (_db, current, digest) => ({ current, digest }))
  const observed = Observe.parse(await runtime(env).read(initial.current.native.saved.intent))
  if (observed.replacement) {
    const retained = Review.parse(JSON.parse(observed.replacement))
    return withAuthority(request.siteId, request.requestId, request.operator, run, async (db, current, digest) => {
      const saved = await loadPrepared(db, retained.reviewId)
      assertPrepared(saved, request.siteId, request.requestId, request.operator, current, digest)
      if (!same(saved.review, retained)) throw conflict()
      return projection(saved, await readApproval(db, saved) ? 'approval-retained' : 'prepared')
    })
  }
  const old = observed.original, previous = DispatchWorkerIntentSchema.parse(JSON.parse(old.intent))
  if (old.state !== 'uploading' || old.etag !== null || (old.claimed_until !== null && old.claimed_until > observed.observedAt)
    || !same(JSON.parse(old.request), initial.current.native.saved.intent)) throw conflict()
  const originalRowDigest = await collectionDigest(old)
  const intent = DispatchWorkerIntentSchema.parse({ ...previous, scriptName: `ps-content-${randomUUID().replaceAll('-', '')}`, ownerTag: `ps-owner-${randomUUID().replaceAll('-', '')}` })
  const review = Review.parse({ version: 1, reviewId: randomUUID(), attemptId: randomUUID(), requestId: request.requestId, request: initial.current.native.saved.intent,
    original: old, originalRowDigest, intent, intentDigest: await collectionDigest(intent), authorityDigest: initial.digest, preparedAt: new Date().toISOString() })
  const key = `native-runtime-recovery-review:${await collectionDigest({ originalRowDigest, authorityDigest: initial.digest })}`
  return withAuthority(request.siteId, request.requestId, request.operator, run, async (db, current, digest) => {
    if (!same(current, initial.current) || digest !== initial.digest) throw conflict()
    const saved = Prepared.parse({ review, authority: current.native, operator: request.operator, operatorProof: current.operatorProof })
    await append(db, saved, 'prepared', key, saved)
    const rows = (await db.query<{ resource_id: string }>(`SELECT resource_id FROM page_studio_audit_events
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`, [review.request.scope.tenantId, review.request.scope.clientId, request.siteId, key])).rows
    if (rows.length !== 1) throw conflict()
    const retained = await loadPrepared(db, rows[0]!.resource_id)
    assertPrepared(retained, request.siteId, request.requestId, request.operator, current, digest)
    if (retained.review.originalRowDigest !== originalRowDigest) throw conflict()
    return projection(retained, 'prepared')
  })
}
/** One explicit operator action advances one D1 approval phase. No provider I/O
 * or PG locks span the private D1 call, and no failed acknowledgement is retried. */
export async function handleNativeRuntimeRecoveryOperator(input: unknown, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  const request = OperatorRequest.parse(input)
  runtime(env)
  if (request.action === 'prepare') return prepare(request, env, run)
  if (!request.reviewId) throw conflict()
  const reviewId = request.reviewId
  const initial = await withAuthority(request.siteId, request.requestId, request.operator, run, async (db, current, digest) => {
    const saved = await loadPrepared(db, reviewId)
    assertPrepared(saved, request.siteId, request.requestId, request.operator, current, digest)
    const approval = await readApproval(db, saved)
    return { saved, approval, projection: await projection(saved, approval ? 'approval-retained' : 'prepared') }
  })
  if (request.action === 'status') return initial.projection
  const result = z.object({ reviewId: z.string().uuid(), attemptId: z.string().uuid(), state: z.enum(['pending', 'reserved', 'uploading', 'ready', 'disabled']) }).strict()
    .parse(await (initial.approval ? runtime(env).approve : runtime(env).create)(initial.saved.review))
  if (result.reviewId !== reviewId || result.attemptId !== initial.saved.review.attemptId || result.state === 'disabled'
    || (initial.approval && result.state === 'pending')) throw conflict()
  return withAuthority(request.siteId, request.requestId, request.operator, run, async (db, current, digest) => {
    const saved = await loadPrepared(db, reviewId)
    assertPrepared(saved, request.siteId, request.requestId, request.operator, current, digest)
    if (!same(saved, initial.saved)) throw conflict()
    if (!initial.approval) await append(db, saved, 'applied', `native-runtime-recovery-applied:${reviewId}`, await expectedApproval(saved.review))
    if (!await readApproval(db, saved)) throw conflict()
    return projection(saved, initial.approval ? 'admitted' : 'approval-retained')
  })
}
/** Every replacement effect rechecks this immutable review, applied receipt and
 * current original/recovered native authority plus pinned operator session. */
export async function authorizeNativeRuntimeRecovery(input: unknown, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  const request = Callback.parse(input)
  runtime(env)
  const saved = await run(db => loadPrepared(db, request.reviewId))
  if (saved.review.attemptId !== request.attemptId || await collectionDigest(saved.review) !== request.reviewDigest) throw denied()
  return withAuthority(saved.review.request.scope.siteId, saved.review.requestId, saved.operator, run, async (db, current, digest) => {
    const retained = await loadPrepared(db, request.reviewId)
    if (!same(saved, retained)) throw conflict()
    assertPrepared(retained, retained.review.request.scope.siteId, retained.review.requestId, retained.operator, current, digest)
    const approval = await readApproval(db, retained)
    if (request.phase !== 'create' && !approval) throw denied()
    return { reference: request, approval }
  })
}
