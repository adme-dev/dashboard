import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoveryReconciliationReceiptSchema } from '~~/shared/pageStudio/transferRecoveryReconciliation'
import {
  TransferRecoveryApprovalSchema,
  verifyRecoveryReview,
  recoveryReviewEvidence
} from '~~/shared/pageStudio/transferRecoveryReview'
import { canonicalRecoveryAdmissionDeadline } from '~~/shared/pageStudio/transferRecoveryAdmission'
import {
  reviewDenied,
  reviewSame,
  type ReviewRoute,
  type recoveryCurrentContext
} from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Capture = z.object({ captureId: Id, digest: Digest }).strict()
const Approval = z
  .object({
    formatVersion: z.literal(1),
    approvalId: Id,
    reviewId: Id,
    reviewDigest: Digest,
    request: TransferRecoveryApprovalSchema,
    originalCapture: Capture,
    freshCapture: Capture,
    operatorConsentId: Id,
    ownerConsentId: Id,
    headVersion: z.literal(2),
    deadline: z.string().datetime()
  })
  .strict()
type Operator = { actorId: string; loginSessionHash: string }
type Stage = 'approved' | 'pending' | 'applied'

/** Immutable evidence readers, NOT current source/phase authority. */
export async function readRecoveryApprovalReview(db: PageStudioQueryClient, reviewId: string) {
  const row = (
    await db.query<{ review: unknown; review_digest: string }>(
      'SELECT review,review_digest FROM page_studio_transfer_recovery_reviews WHERE review_id=$1 FOR SHARE NOWAIT',
      [reviewId]
    )
  ).rows[0]
  if (!row) throw reviewDenied()
  return {
    row,
    review: await verifyRecoveryReview(row.review, row.review_digest)
  }
}
export async function readRecoveryApprovalEvidence(
  db: PageStudioQueryClient,
  route: ReviewRoute,
  operator: Operator,
  reviewId: string,
  stage: Stage,
  loaded: Awaited<ReturnType<typeof readRecoveryApprovalReview>>,
  context: Awaited<ReturnType<typeof recoveryCurrentContext>>
) {
  const { row, review } = loaded
  const a = review.evidence.authority,
    p = review.evidence.principals
  if (
    a.requestId !== route.requestId ||
    a.requestRevision !== route.expectedRevision ||
    a.operationId !== context.intent.operationId ||
    a.intentDigest !== (await collectionDigest(context.intent)) ||
    a.recoveryId !== context.head.recovery_id ||
    a.epoch !== 1 ||
    p.siteId !== route.siteId ||
    p.operatorId !== operator.actorId ||
    !reviewSame(
      {
        accountId: p.accountId,
        identityId: p.identityId,
        workspaceId: p.workspaceId
      },
      context.intent.authority.owner
    ) ||
    !reviewSame(review.renewal, context.renewal) ||
    review.evidence.sourceDataDigest !== (await collectionDigest(context.intent.source))
  )
    throw reviewDenied()
  const heads = (
    await db.query<{
      review_revision: number
      review_digest: string
      reconciliation_digest: string
      admission_id: string | null
      d1_prepared_digest: string | null
      applied_grant_digest: string | null
      exact_deadline: string
    }>(
      `SELECT review_revision,review_digest,reconciliation_digest,admission_id,d1_prepared_digest,applied_grant_digest,
    to_char(deadline AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_deadline
    FROM page_studio_transfer_recovery_heads WHERE operation_id=$1`,
      [a.operationId]
    )
  ).rows
  const head = heads[0]
  if (
    heads.length !== 1 ||
    !head ||
    head.review_revision !== review.revision ||
    head.review_digest !== row.review_digest ||
    (
      await db.query<{ revision: number }>(
        'SELECT max(revision)::integer AS revision FROM page_studio_transfer_recovery_reviews WHERE operation_id=$1 AND recovery_id=$2',
        [a.operationId, a.recoveryId]
      )
    ).rows[0]?.revision !== review.revision
  )
    throw reviewDenied()
  const deadline = canonicalRecoveryAdmissionDeadline(head.exact_deadline)
  const approvals = (
    await db.query<{ approval: unknown; approval_digest: string }>(
      'SELECT approval,approval_digest FROM page_studio_transfer_recovery_approvals WHERE review_id=$1',
      [reviewId]
    )
  ).rows
  if (approvals.length !== 1) throw reviewDenied()
  const approval = Approval.parse(approvals[0]!.approval)
  if (
    (await collectionDigest(approval)) !== approvals[0]!.approval_digest ||
    approval.reviewId !== reviewId ||
    approval.reviewDigest !== row.review_digest ||
    approval.freshCapture.digest !== head.reconciliation_digest ||
    canonicalRecoveryAdmissionDeadline(approval.deadline) !== deadline ||
    !reviewSame(approval.originalCapture, review.originalCapture) ||
    !reviewSame(approval.request.operator, operator) ||
    !reviewSame(approval.request.review, {
      reviewId,
      revision: review.revision,
      reviewDigest: row.review_digest
    }) ||
    approval.request.siteId !== route.siteId ||
    approval.request.requestId !== route.requestId ||
    approval.request.expectedRevision !== route.expectedRevision ||
    approval.request.captureId !== approval.freshCapture.captureId ||
    approval.request.approvalId !== approval.approvalId
  )
    throw reviewDenied()
  const consents = (
    await db.query<{
      consent_id: string
      party: string
      actor_id: string
      login_hash: string
    }>(
      `SELECT consent_id,party,actor_id,login_hash FROM page_studio_transfer_recovery_consents
    WHERE review_id=$1 AND expires_at>clock_timestamp() AND expires_at>=$2::timestamptz FOR SHARE NOWAIT`,
      [reviewId, deadline]
    )
  ).rows
  const staff = consents.find((c) => c.party === 'operator'),
    owner = consents.find((c) => c.party === 'owner')
  if (
    consents.length !== 2 ||
    staff?.consent_id !== approval.operatorConsentId ||
    owner?.consent_id !== approval.ownerConsentId ||
    staff.actor_id !== operator.actorId ||
    staff.login_hash !== operator.loginSessionHash ||
    owner.actor_id !== p.identityId
  )
    throw reviewDenied()
  return {
    route,
    operator,
    stage,
    review,
    reviewDigest: row.review_digest,
    context,
    head,
    deadline,
    approval,
    ownerHash: owner.login_hash
  }
}
export async function readRecoveryApprovedCapture(
  db: PageStudioQueryClient,
  proof: Awaited<ReturnType<typeof readRecoveryApprovalEvidence>>
) {
  const { approval, head, review } = proof
  const r = (
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
    FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1`,
      [approval.freshCapture.captureId]
    )
  ).rows[0]
  if (
    !r ||
    r.invariant_json !== collectionCanonical(r.invariant) ||
    (await collectionDigest(r.invariant)) !== r.invariant_digest ||
    r.invariant_digest !== head.reconciliation_digest
  )
    throw reviewDenied()
  const receipt = TransferRecoveryReconciliationReceiptSchema.parse({
    invariant: r.invariant,
    digest: r.invariant_digest,
    observedStartedAt: r.started,
    observedCompletedAt: r.completed
  })
  if (
    receipt.invariant.captureId !== approval.freshCapture.captureId ||
    !reviewSame(recoveryReviewEvidence(receipt), review.evidence)
  )
    throw reviewDenied()
  return { ...proof, receipt }
}
