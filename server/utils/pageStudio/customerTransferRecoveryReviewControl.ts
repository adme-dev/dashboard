import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { RecoveryReviewControlInput, RecoveryReviewPublicView, RecoveryReviewSummary, matchesRecoveryReviewControl } from '~~/shared/pageStudio/transferRecoveryReviewControl'
import { verifyRecoveryReview } from '~~/shared/pageStudio/transferRecoveryReview'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import { renewCustomerTransferPlan } from './customerTransferPlanRenewal'
import { readCustomerTransferRecoveryReview, createCustomerTransferRecoveryReview, consentCustomerTransferRecoveryReview, approveCustomerTransferRecoveryReview } from './customerTransferRecoveryReview'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const fail = () => createError({ statusCode: 503, statusMessage: 'Recovery review is unavailable' })
const Original = z.object({ operation_id: z.string().uuid(), intent_digest: z.string().regex(/^[a-f0-9]{64}$/), entitlement_id: z.string().uuid() }).strict()
/** Public projection is assembled explicitly. Never spread stored review,
 * approval.request, private physical inventory, or authentication into a view. */
async function summary(value: Awaited<ReturnType<typeof readCustomerTransferRecoveryReview>>) {
  const review = await verifyRecoveryReview(value.review, value.reference.reviewDigest)
  if (review.reviewId !== value.reference.reviewId || review.revision !== value.reference.revision) throw fail()
  const plan = review.renewal.entitlementSnapshot
  return RecoveryReviewSummary.parse({ reference: value.reference, maximumDeadline: review.maximumDeadline,
    remainingWork: review.remainingWork, consents: value.consents,
    plan: { pages: plan.pages_per_site_limit, storageBytes: plan.storage_bytes_limit, customDomains: plan.custom_domain_limit,
      monthlyBuilds: plan.monthly_build_limit, monthlyTrafficBytes: plan.monthly_traffic_bytes_limit, monthlyAiOperations: plan.monthly_ai_operation_limit } })
}
/** Private dispatcher. Each helper rechecks its original principals; no caller
 * may supply a renewal's operation, intent, old plan or physical evidence. */
export async function controlCustomerTransferRecoveryReview(raw: unknown, dependencies: { runTransaction?: RunPageStudioTransaction, env?: Record<string, unknown> } = {}) {
  const input = RecoveryReviewControlInput.parse(raw)
  const { siteId, requestId, expectedRevision, authentication, request: action } = input
  const scope = { siteId, requestId, expectedRevision }, runTransaction = dependencies.runTransaction ?? transactionWithoutRetry
  const d = { ...dependencies, runTransaction }
  let result: unknown
  if (action.action === 'read') {
    const value = await readCustomerTransferRecoveryReview({ ...scope, review: action.review }, authentication, d)
    result = { ...scope, action: action.action, historical: true, review: await summary(value) }
  } else if (action.action === 'consent-review') {
    const value = await consentCustomerTransferRecoveryReview({ ...scope, review: action.review, consentId: action.consentId }, authentication, d)
    result = { ...scope, action: action.action, historical: value.historical, review: action.review, consentId: value.consentId, party: value.party }
  } else {
    if (!('operator' in authentication)) throw fail()
    const { operator } = authentication
    if (action.action === 'renew-plan') {
      const original = await runTransaction(async db => {
        await readCustomerTransferRecovery({ siteId, requestId, operator, query: { expectedRevision } }, { runTransaction: work => work(db) })
        const rows = (await db.query(`SELECT operation_id,intent_digest,entitlement_id FROM page_studio_transfer_requests
          WHERE site_id=$1 AND request_id=$2 AND revision=$3 AND operator_id=$4 AND state='reserved' FOR SHARE NOWAIT`,
        [siteId, requestId, expectedRevision, operator.actorId])).rows
        if (rows.length !== 1) throw fail()
        return Original.parse(rows[0])
      })
      const value = await renewCustomerTransferPlan({ operator, body: { requestId: action.renewalRequestId, transferRequestId: requestId,
        operationId: original.operation_id, intentDigest: original.intent_digest, expectedEntitlementId: original.entitlement_id,
        recoveryId: action.recoveryId, epoch: 1, expectedHeadVersion: action.expectedHeadVersion, effectiveUntil: action.effectiveUntil, reason: action.reason } }, { runTransaction })
      if (value.entitlement.siteId !== siteId) throw fail()
      result = { ...scope, action: action.action, historical: value.replayed, renewalRequestId: action.renewalRequestId,
        recoveryId: action.recoveryId, effectiveUntil: action.effectiveUntil, planKey: value.entitlement.planKey }
    } else if (action.action === 'create-review') {
      const created = await createCustomerTransferRecoveryReview({ ...scope, operator, body: action.body }, d)
      // A replay may already have consents. Read the exact immutable reference
      // instead of fabricating empty/current consent state from a write receipt.
      const value = await readCustomerTransferRecoveryReview({ ...scope, review: created.reference }, authentication, d)
      result = { ...scope, action: action.action, historical: created.historical, review: await summary(value) }
    } else {
      const approvalInput = { ...scope, operator, review: action.review, approvalId: action.approvalId, captureId: action.captureId }
      const value = await approveCustomerTransferRecoveryReview(approvalInput, d)
      if (collectionCanonical(value.approval.request) !== collectionCanonical(approvalInput)
        || value.approval.approvalId !== action.approvalId || value.approval.reviewId !== action.review.reviewId
        || value.approval.reviewDigest !== action.review.reviewDigest) throw fail()
      result = { ...scope, action: action.action, historical: value.historical, review: action.review,
        approvalId: action.approvalId, deadline: value.approval.deadline }
    }
  }
  const view = RecoveryReviewPublicView.parse(result)
  if (!matchesRecoveryReviewControl(view, input)) throw fail()
  return view
}
