import { z } from 'zod'

// Public validation only: private reconciliation evidence stays in transferRecoveryReview.
const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Version = z.number().int().min(1).max(2147483646)
const Instant = z
  .string()
  .datetime({ offset: true })
  .transform(v => new Date(v).toISOString())
export { Instant as TransferRecoveryReviewInstantSchema }

export const TransferRecoveryReviewReferenceSchema = z
  .object({ reviewId: Id, revision: Version, reviewDigest: Digest })
  .strict()
export const TransferRecoveryReviewRouteSchema = z
  .object({ siteId: Id, requestId: Id, expectedRevision: Version })
  .strict()
export const TransferRecoveryReviewOperatorSchema = z.object({ actorId: Id, loginSessionHash: Digest }).strict()
export const TransferRecoveryReviewCreateSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  body: z
    .object({
      reviewId: Id,
      expectedReviewRevision: z.number().int().min(0).max(2147483645),
      recoveryId: Id,
      expectedHeadVersion: z.literal(1),
      renewalRequestId: Id,
      captureId: Id,
      maximumDeadline: Instant
    })
    .strict()
}).strict()
export const TransferRecoveryConsentSchema = TransferRecoveryReviewRouteSchema.extend({
  review: TransferRecoveryReviewReferenceSchema,
  consentId: Id
}).strict()
export const TransferRecoveryApprovalSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  review: TransferRecoveryReviewReferenceSchema,
  approvalId: Id,
  captureId: Id
}).strict()
