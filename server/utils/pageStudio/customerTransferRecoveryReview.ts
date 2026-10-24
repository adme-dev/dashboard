import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { readCustomerSessionIdentityFromHash } from './customerProvisioning'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoveryReconciliationReceiptSchema } from '~~/shared/pageStudio/transferRecoveryReconciliation'
import {
  TransferRecoveryReviewCreateSchema,
  type TransferRecoveryReviewReferenceSchema,
  TransferRecoveryReviewSchema,
  TransferRecoveryConsentSchema,
  TransferRecoveryApprovalSchema,
  TransferRecoveryReviewOperatorSchema,
  recoveryReviewEvidence,
  verifyRecoveryReview
} from '~~/shared/pageStudio/transferRecoveryReview'
import { inspectCustomerTransferRecovery } from './customerTransferRecoveryCoordinator'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import {
  recoveryReviewContext,
  recoveryReviewClock,
  reviewDenied,
  reviewSame,
  type ReviewActor,
  type ReviewRoute
} from './customerTransferRecoveryReviewAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Create = z.infer<typeof TransferRecoveryReviewCreateSchema>
type Review = z.infer<typeof TransferRecoveryReviewSchema>
type Reference = z.infer<typeof TransferRecoveryReviewReferenceSchema>
type Inspection = Parameters<typeof inspectCustomerTransferRecovery>[0]
interface Dependencies {
  runTransaction?: RunPageStudioTransaction
  env?: Record<string, unknown>
  /** Trusted server/test adapter only. Request bodies cannot provide evidence. */
  recapture?: (input: Inspection) => Promise<unknown>
}
const runOf = (d: Dependencies) => d.runTransaction ?? transactionWithoutRetry
const actorInput = z.object({ operator: TransferRecoveryReviewOperatorSchema }).strict()
const ownerInput = z.object({ ownerToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict()
const ref = (review: Review, digest: string) => ({
  reviewId: review.reviewId,
  revision: review.revision,
  reviewDigest: digest
})
async function retained(db: PageStudioQueryClient, id: string) {
  const row = (
    await db.query<{ review: unknown; review_digest: string; request: unknown; operator_login_hash: string }>(
      'SELECT review,review_digest,request,operator_login_hash FROM page_studio_transfer_recovery_reviews WHERE review_id=$1 FOR SHARE NOWAIT',
      [id]
    )
  ).rows[0]
  return row ? { ...row, review: await verifyRecoveryReview(row.review, row.review_digest) } : null
}
async function exact(db: PageStudioQueryClient, reference: Reference) {
  const row = await retained(db, reference.reviewId)
  if (!row || !reviewSame(ref(row.review, row.review_digest), reference)) throw reviewDenied()
  return row
}
async function receipt(db: PageStudioQueryClient, captureId: string) {
  const row = (
    await db.query<{
      invariant: unknown
      invariant_json: string
      invariant_digest: string
      started: string
      completed: string
    }>(
      `SELECT invariant,invariant_json,invariant_digest,
    to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS started,
    to_char(observed_completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed
    FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1 FOR SHARE NOWAIT`,
      [captureId]
    )
  ).rows[0]
  if (
    !row ||
    row.invariant_json !== collectionCanonical(row.invariant) ||
    (await collectionDigest(row.invariant)) !== row.invariant_digest
  )
    throw reviewDenied()
  return TransferRecoveryReconciliationReceiptSchema.parse({
    invariant: row.invariant,
    digest: row.invariant_digest,
    observedStartedAt: row.started,
    observedCompletedAt: row.completed
  })
}
async function latest(db: PageStudioQueryClient, review: Review) {
  const a = review.evidence.authority
  if (
    (
      await db.query<{ revision: number }>(
        `SELECT max(revision)::integer AS revision FROM page_studio_transfer_recovery_reviews
    WHERE operation_id=$1 AND recovery_id=$2`,
        [a.operationId, a.recoveryId]
      )
    ).rows[0]?.revision !== review.revision
  )
    throw reviewDenied()
}
async function current(
  db: PageStudioQueryClient,
  route: ReviewRoute,
  actor: ReviewActor,
  review: Review,
  approved = false
) {
  const context = await recoveryReviewContext(db, route, actor, review.renewal.requestId, approved)
  const a = review.evidence.authority,
    p = review.evidence.principals
  if (
    a.requestId !== route.requestId ||
    a.requestRevision !== route.expectedRevision ||
    a.operationId !== context.intent.operationId ||
    a.intentDigest !== (await collectionDigest(context.intent)) ||
    a.recoveryId !== context.head.recovery_id ||
    a.epoch !== context.head.epoch ||
    (!approved &&
      (a.pgVersion !== context.head.cas_version ||
        new Date(a.deadline).getTime() !== context.head.deadline.getTime())) ||
    p.siteId !== route.siteId ||
    !reviewSame(
      { accountId: p.accountId, identityId: p.identityId, workspaceId: p.workspaceId },
      context.intent.authority.owner
    ) ||
    p.operatorId !== context.intent.authority.operatorId ||
    !reviewSame(review.renewal, context.renewal) ||
    review.evidence.sourceDataDigest !== (await collectionDigest(context.intent.source))
  )
    throw reviewDenied()
  await latest(db, review)
  return context
}
function captureFor(d: Dependencies) {
  const adapter = d.recapture,
    env = d.env
  return async (input: Inspection) => {
    if (d.recapture !== adapter || d.env !== env) throw reviewDenied()
    if (adapter) await adapter(structuredClone(input))
    else {
      if (!env) throw reviewDenied()
      await inspectCustomerTransferRecovery(input, { env, runTransaction: runOf(d) })
    }
    if (d.recapture !== adapter || d.env !== env) throw reviewDenied()
  }
}
async function authenticatedHistory(db: PageStudioQueryClient, route: ReviewRoute, operator: Create['operator']) {
  await readCustomerTransferRecovery(
    { ...route, operator, query: { expectedRevision: route.expectedRevision } },
    { runTransaction: (work) => work(db) }
  )
}
async function reader(db: PageStudioQueryClient, route: ReviewRoute, actor: ReviewActor, review: Review) {
  const { authority: a, principals: p } = review.evidence
  if (route.siteId !== p.siteId || route.requestId !== a.requestId || route.expectedRevision !== a.requestRevision)
    throw reviewDenied()
  if (actor.operator) {
    if (actor.operator.actorId !== p.operatorId) throw reviewDenied()
    await authenticatedHistory(db, route, actor.operator)
    return
  }
  if (!actor.ownerHash || (await readCustomerSessionIdentityFromHash(db, actor.ownerHash)) !== p.identityId)
    throw reviewDenied()
  await requireCustomerInspectionAuthority(db, {
    actorId: p.identityId,
    accountId: p.accountId,
    workspaceId: p.workspaceId,
    siteId: p.siteId
  })
  if (
    !(
      await db.query(
        `SELECT 1 FROM page_studio_customer_sessions login CROSS JOIN page_studio_workspace_memberships member
    WHERE login.token_hash=$1 AND login.expires_at>clock_timestamp() AND login.revoked_at IS NULL
      AND member.identity_id=$2 AND member.workspace_id=$3 AND member.role='owner' AND member.revoked_at IS NULL
      AND (member.expires_at IS NULL OR member.expires_at>clock_timestamp())`,
        [actor.ownerHash, p.identityId, p.workspaceId]
      )
    ).rows.length
  )
    throw reviewDenied()
}
async function parseActor(authentication: unknown): Promise<ReviewActor> {
  const operator = actorInput.safeParse(authentication),
    owner = ownerInput.safeParse(authentication)
  if (!operator.success && !owner.success) throw reviewDenied()
  return operator.success
    ? { operator: operator.data.operator }
    : { ownerHash: await digestPortalSessionToken(owner.data!.ownerToken) }
}
/** Explicit immutable review retrieval, never refreshed physical proof or grant. */
export async function readCustomerTransferRecoveryReview(
  input: unknown,
  authentication: unknown,
  d: Dependencies = {}
) {
  const value = TransferRecoveryConsentSchema.omit({ consentId: true }).parse(input),
    actor = await parseActor(authentication)
  return runOf(d)(async (db) => {
    const saved = await exact(db, value.review)
    const consents = (
      await db.query<{ party: string; expired: boolean }>(
        `SELECT party,expires_at<=clock_timestamp() AS expired
      FROM page_studio_transfer_recovery_consents WHERE review_id=$1 ORDER BY party`,
        [saved.review.reviewId]
      )
    ).rows
    await reader(db, value, actor, saved.review)
    return { historical: true, review: saved.review, reference: value.review, consents }
  })
}
async function freshCapture(
  db: PageStudioQueryClient,
  id: string,
  started: Date,
  context: Awaited<ReturnType<typeof recoveryReviewContext>>
) {
  const value = await receipt(db, id),
    a = value.invariant.authority
  if (
    value.invariant.captureId !== id ||
    new Date(value.observedStartedAt) < started ||
    a.operationId !== context.intent.operationId ||
    a.intentDigest !== (await collectionDigest(context.intent)) ||
    a.recoveryId !== context.head.recovery_id ||
    a.pgVersion !== context.head.cas_version ||
    a.d1Version !== 1 ||
    a.epoch !== 1 ||
    new Date(a.deadline).getTime() !== context.head.deadline.getTime()
  )
    throw reviewDenied()
  return value
}
export async function createCustomerTransferRecoveryReview(input: unknown, d: Dependencies) {
  const value = TransferRecoveryReviewCreateSchema.parse(input),
    { body, operator, ...route } = value,
    run = runOf(d),
    capture = captureFor(d)
  const before = await run(async (db) => {
    const old = await retained(db, body.reviewId)
    if (old) {
      await authenticatedHistory(db, route, operator)
      if (!reviewSame(old.request, value) || old.operator_login_hash !== operator.loginSessionHash) throw reviewDenied()
      return { replay: { historical: true, review: old.review, reference: ref(old.review, old.review_digest) } }
    }
    const context = await recoveryReviewContext(db, route, { operator }, body.renewalRequestId)
    if (
      context.head.recovery_id !== body.recoveryId ||
      context.head.cas_version !== body.expectedHeadVersion ||
      new Date(body.maximumDeadline) > context.head.deadline ||
      new Date(body.maximumDeadline) > context.plan.effective_until
    )
      throw reviewDenied()
    if (
      (
        await db.query('SELECT 1 FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1', [
          body.captureId
        ])
      ).rows.length
    )
      throw reviewDenied()
    const started = (await db.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now
    await recoveryReviewClock(db, context, body.maximumDeadline, { operator: operator.loginSessionHash })
    return { context, started }
  })
  if (before.replay) return before.replay
  await capture({
    siteId: route.siteId,
    requestId: route.requestId,
    operator,
    body: {
      action: 'inspect',
      expectedRevision: route.expectedRevision,
      recoveryId: body.recoveryId,
      expectedHeadVersion: body.expectedHeadVersion,
      captureId: body.captureId
    }
  })
  return run(async (db) => {
    const context = await recoveryReviewContext(db, route, { operator }, body.renewalRequestId)
    if (!reviewSame(context, before.context)) throw reviewDenied()
    const capture = await freshCapture(db, body.captureId, before.started!, context),
      evidence = recoveryReviewEvidence(capture)
    const review = TransferRecoveryReviewSchema.parse({
      formatVersion: 1,
      reviewId: body.reviewId,
      revision: body.expectedReviewRevision + 1,
      evidence,
      evidenceDigest: await collectionDigest(evidence),
      originalCapture: { captureId: body.captureId, digest: capture.digest },
      renewal: context.renewal,
      maximumDeadline: body.maximumDeadline,
      remainingWork: 'same-operation-source-through-retention'
    })
    const digest = await collectionDigest(review)
    await db.query(
      `INSERT INTO page_studio_transfer_recovery_reviews(review_id,operation_id,recovery_id,revision,review_digest,review,request,operator_login_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        review.reviewId,
        context.intent.operationId,
        body.recoveryId,
        review.revision,
        digest,
        review,
        value,
        operator.loginSessionHash
      ]
    )
    await current(db, route, { operator }, review)
    const deadline = await recoveryReviewClock(db, context, body.maximumDeadline, {
      operator: operator.loginSessionHash
    })
    if (new Date(deadline).getTime() < new Date(body.maximumDeadline).getTime()) throw reviewDenied()
    return { historical: false, review, reference: ref(review, digest) }
  })
}
export async function consentCustomerTransferRecoveryReview(
  input: unknown,
  authentication: unknown,
  d: Dependencies = {}
) {
  const value = TransferRecoveryConsentSchema.parse(input),
    actor = await parseActor(authentication)
  const party = actor.operator ? 'operator' : 'owner',
    hash = actor.operator?.loginSessionHash ?? actor.ownerHash!
  return runOf(d)(async (db) => {
    const saved = await exact(db, value.review),
      review = saved.review
    const id = party === 'operator' ? review.evidence.principals.operatorId : review.evidence.principals.identityId
    const existing = (
      await db.query<{
        consent_id: string
        party: string
        actor_id: string
        login_hash: string
        review_id: string
        review_digest: string
      }>(
        'SELECT * FROM page_studio_transfer_recovery_consents WHERE consent_id=$1 OR (review_id=$2 AND party=$3) FOR SHARE NOWAIT',
        [value.consentId, review.reviewId, party]
      )
    ).rows
    if (existing.length) {
      const row = existing[0]!
      if (
        existing.length !== 1 ||
        row.consent_id !== value.consentId ||
        row.party !== party ||
        row.actor_id !== id ||
        row.login_hash !== hash ||
        row.review_id !== review.reviewId ||
        row.review_digest !== value.review.reviewDigest
      )
        throw reviewDenied()
      await reader(db, value, actor, review)
      return { historical: true, consentId: value.consentId, party }
    }
    const context = await current(db, value, actor, review)
    const expires = await recoveryReviewClock(db, context, review.maximumDeadline, {
      operator: actor.operator?.loginSessionHash,
      owner: actor.ownerHash
    })
    await db.query(
      `INSERT INTO page_studio_transfer_recovery_consents(consent_id,review_id,revision,review_digest,party,actor_id,login_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [value.consentId, review.reviewId, review.revision, value.review.reviewDigest, party, id, hash, expires]
    )
    await current(db, value, actor, review)
    await recoveryReviewClock(db, context, expires, {
      operator: actor.operator?.loginSessionHash,
      owner: actor.ownerHash
    })
    return { historical: false, consentId: value.consentId, party }
  })
}
export async function approveCustomerTransferRecoveryReview(input: unknown, d: Dependencies) {
  const value = TransferRecoveryApprovalSchema.parse(input),
    { operator, ...route } = value,
    run = runOf(d),
    capture = captureFor(d)
  const consents = async (db: PageStudioQueryClient, review: Review) => {
    const rows = (
      await db.query<{ consent_id: string; party: string; actor_id: string; login_hash: string; expires_at: Date }>(
        'SELECT * FROM page_studio_transfer_recovery_consents WHERE review_id=$1 FOR SHARE NOWAIT',
        [review.reviewId]
      )
    ).rows
    const staff = rows.find((r) => r.party === 'operator'),
      owner = rows.find((r) => r.party === 'owner')
    if (
      rows.length !== 2 ||
      !staff ||
      !owner ||
      staff.actor_id !== operator.actorId ||
      staff.login_hash !== operator.loginSessionHash ||
      owner.actor_id !== review.evidence.principals.identityId
    )
      throw reviewDenied()
    await current(db, route, { ownerHash: owner.login_hash }, review)
    return { staff, owner }
  }
  const before = await run(async (db) => {
    const old = (
      await db.query<{ approval: Record<string, unknown>; approval_digest: string }>(
        'SELECT approval,approval_digest FROM page_studio_transfer_recovery_approvals WHERE approval_id=$1',
        [value.approvalId]
      )
    ).rows[0]
    if (old) {
      if (!reviewSame(old.approval.request, value) || (await collectionDigest(old.approval)) !== old.approval_digest)
        throw reviewDenied()
      // The final genuine-session clock follows even asynchronous digest work.
      await authenticatedHistory(db, route, operator)
      return { replay: { historical: true, approval: old.approval, digest: old.approval_digest } }
    }
    const saved = await exact(db, value.review),
      context = await current(db, route, { operator }, saved.review)
    const approvals = await consents(db, saved.review)
    if (
      (
        await db.query('SELECT 1 FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1', [
          value.captureId
        ])
      ).rows.length
    )
      throw reviewDenied()
    const started = (await db.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now
    await recoveryReviewClock(db, context, saved.review.maximumDeadline, {
      operator: operator.loginSessionHash,
      owner: approvals.owner.login_hash
    })
    return { saved, context, approvals, started }
  })
  if (before.replay) return before.replay
  const review = before.saved!.review,
    a = review.evidence.authority
  await capture({
    siteId: route.siteId,
    requestId: route.requestId,
    operator,
    body: {
      action: 'inspect',
      expectedRevision: route.expectedRevision,
      recoveryId: a.recoveryId,
      expectedHeadVersion: a.pgVersion,
      captureId: value.captureId
    }
  })
  return run(async (db) => {
    const context = await current(db, route, { operator }, review),
      approvals = await consents(db, review)
    if (!reviewSame(context, before.context) || !reviewSame(approvals, before.approvals)) throw reviewDenied()
    const fresh = await freshCapture(db, value.captureId, before.started!, context)
    if (!reviewSame(recoveryReviewEvidence(fresh), review.evidence)) throw reviewDenied()
    const max = new Date(
      Math.min(
        new Date(review.maximumDeadline).getTime(),
        approvals.owner.expires_at.getTime(),
        approvals.staff.expires_at.getTime()
      )
    ).toISOString()
    const deadline = await recoveryReviewClock(db, context, max, {
      operator: operator.loginSessionHash,
      owner: approvals.owner.login_hash
    })
    const approval = {
      formatVersion: 1,
      approvalId: value.approvalId,
      reviewId: review.reviewId,
      reviewDigest: value.review.reviewDigest,
      request: value,
      originalCapture: review.originalCapture,
      freshCapture: { captureId: value.captureId, digest: fresh.digest },
      operatorConsentId: approvals.staff.consent_id,
      ownerConsentId: approvals.owner.consent_id,
      headVersion: 2,
      deadline
    }
    const digest = await collectionDigest(approval)
    await db.query(
      `INSERT INTO page_studio_transfer_recovery_approvals(approval_id,review_id,fresh_capture_id,approval,approval_digest)
      VALUES($1,$2,$3,$4,$5)`,
      [value.approvalId, review.reviewId, value.captureId, approval, digest]
    )
    if (
      (
        await db.query(
          `UPDATE page_studio_transfer_recovery_heads SET mode='approved',cas_version=2,
      review_revision=$4,review_digest=$5,reconciliation_digest=$6,deadline=$7
      WHERE operation_id=$1 AND recovery_id=$2 AND intent_digest=$3 AND epoch=1 AND cas_version=1 AND mode='reconciling' RETURNING operation_id`,
          [
            a.operationId,
            a.recoveryId,
            a.intentDigest,
            review.revision,
            value.review.reviewDigest,
            fresh.digest,
            deadline
          ]
        )
      ).rows.length !== 1
    )
      throw reviewDenied()
    await current(db, route, { ownerHash: approvals.owner.login_hash }, review, true)
    await current(db, route, { operator }, review, true)
    await recoveryReviewClock(
      db,
      context,
      deadline,
      { operator: operator.loginSessionHash, owner: approvals.owner.login_hash },
      'approved'
    )
    return { historical: false, approval, digest }
  })
}
