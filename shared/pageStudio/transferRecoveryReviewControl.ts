import { z } from 'zod'
import { CustomerAdoptionCustomerOriginSchema } from './customerAdoptionTransport'
import { collectionCanonical } from './collectionApi'
import { managementResultSchema } from './managementResult'
import { TransferRecoveryReviewCreateSchema, TransferRecoveryReviewOperatorSchema, TransferRecoveryReviewReferenceSchema, TransferRecoveryReviewRouteSchema } from './transferRecoveryReview'

const Id = z.string().uuid()
const Instant = z.string().datetime()
const Read = z.object({ action: z.literal('read'), review: TransferRecoveryReviewReferenceSchema }).strict()
const Consent = z.object({ action: z.literal('consent-review'), review: TransferRecoveryReviewReferenceSchema, consentId: Id }).strict()
export const RecoveryReviewOwnerAction = z.discriminatedUnion('action', [Read, Consent])
export const RecoveryReviewOperatorAction = z.discriminatedUnion('action', [Read, Consent,
  z.object({ action: z.literal('renew-plan'), renewalRequestId: Id, recoveryId: Id, expectedHeadVersion: z.literal(1),
    effectiveUntil: Instant, reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal('create-review'), body: TransferRecoveryReviewCreateSchema.shape.body }).strict(),
  z.object({ action: z.literal('approve-review'), review: TransferRecoveryReviewReferenceSchema, approvalId: Id, captureId: Id }).strict()
])
const Scope = TransferRecoveryReviewRouteSchema
export const RecoveryReviewControlInput = z.union([
  Scope.extend({ expectedEnvironment: z.literal('production'), authentication: z.object({ operator: TransferRecoveryReviewOperatorSchema }).strict(), request: RecoveryReviewOperatorAction }).strict(),
  Scope.extend({ expectedEnvironment: z.literal('production'), authentication: z.object({ ownerToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict(), request: RecoveryReviewOwnerAction }).strict()
])
const Allowances = z.object({ pages: z.number().int().positive(), storageBytes: z.number().int().nonnegative().safe(),
  customDomains: z.number().int().nonnegative(), monthlyBuilds: z.number().int().nonnegative(), monthlyTrafficBytes: z.number().int().nonnegative().safe(), monthlyAiOperations: z.literal(0) }).strict()
export const RecoveryReviewSummary = z.object({ reference: TransferRecoveryReviewReferenceSchema, maximumDeadline: Instant,
  remainingWork: z.literal('same-operation-source-through-retention'), plan: Allowances,
  consents: z.array(z.object({ party: z.enum(['owner', 'operator']), expired: z.boolean() }).strict()).max(2)
}).strict().refine(value => new Set(value.consents.map(consent => consent.party)).size === value.consents.length)
export const RecoveryReviewPublicView = z.discriminatedUnion('action', [
  Scope.extend({ action: z.literal('read'), historical: z.literal(true), review: RecoveryReviewSummary }).strict(),
  Scope.extend({ action: z.literal('create-review'), historical: z.boolean(), review: RecoveryReviewSummary }).strict(),
  Scope.extend({ action: z.literal('renew-plan'), historical: z.boolean(), renewalRequestId: Id, recoveryId: Id, effectiveUntil: Instant, planKey: z.string().min(1).max(200) }).strict(),
  Scope.extend({ action: z.literal('consent-review'), historical: z.boolean(), review: TransferRecoveryReviewReferenceSchema, consentId: Id, party: z.enum(['owner', 'operator']) }).strict(),
  Scope.extend({ action: z.literal('approve-review'), historical: z.boolean(), review: TransferRecoveryReviewReferenceSchema, approvalId: Id, deadline: Instant }).strict()
])
export const RECOVERY_REVIEW_CONTROL_URL = 'https://page-studio-management.internal/transfer-recovery-review-control'
export const RECOVERY_REVIEW_CONTROL_UNAVAILABLE = 'The recovery review could not be confirmed. Refresh the saved review before continuing.'
export const RecoveryReviewControlResponse = managementResultSchema(RecoveryReviewPublicView,
  z.object({ statusCode: z.number().int().min(400).max(599), message: z.literal(RECOVERY_REVIEW_CONTROL_UNAVAILABLE) }).strict())
export type RecoveryReviewControlRequest = z.infer<typeof RecoveryReviewControlInput>
export type RecoveryReviewControlView = z.infer<typeof RecoveryReviewPublicView>
export function matchesRecoveryReviewControl(view: RecoveryReviewControlView, input: RecoveryReviewControlRequest) {
  if (view.siteId !== input.siteId || view.requestId !== input.requestId || view.expectedRevision !== input.expectedRevision || view.action !== input.request.action) return false
  const action = input.request
  if (view.action === 'read' && action.action === 'read') return collectionCanonical(view.review.reference) === collectionCanonical(action.review)
  if (view.action === 'create-review' && action.action === 'create-review') return view.review.reference.reviewId === action.body.reviewId
    && view.review.reference.revision === action.body.expectedReviewRevision + 1 && view.review.maximumDeadline === action.body.maximumDeadline
  if (view.action === 'renew-plan' && action.action === 'renew-plan') return view.renewalRequestId === action.renewalRequestId
    && view.recoveryId === action.recoveryId && view.effectiveUntil === action.effectiveUntil
  if (view.action === 'consent-review' && action.action === 'consent-review') return collectionCanonical(view.review) === collectionCanonical(action.review)
    && view.consentId === action.consentId && view.party === ('operator' in input.authentication ? 'operator' : 'owner')
  return view.action === 'approve-review' && action.action === 'approve-review'
    && collectionCanonical(view.review) === collectionCanonical(action.review) && view.approvalId === action.approvalId
}

export const RecoveryReviewOperatorPublicResponse = z.object({ view: RecoveryReviewPublicView, customerOrigin: CustomerAdoptionCustomerOriginSchema.nullable() }).strict()
