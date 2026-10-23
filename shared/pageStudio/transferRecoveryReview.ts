import { z } from 'zod'
import { TransferRecoveryReviewInstantSchema as Instant } from './transferRecoveryReviewPublic'
import { collectionDigest } from './collectionApi'
import {
  TransferRecoveryReconciliationInvariantSchema,
  TransferRecoveryReconciliationReceiptSchema
} from './transferRecoveryReconciliation'

export { TransferRecoveryReviewReferenceSchema, TransferRecoveryReviewRouteSchema, TransferRecoveryReviewOperatorSchema, TransferRecoveryReviewCreateSchema, TransferRecoveryConsentSchema, TransferRecoveryApprovalSchema } from './transferRecoveryReviewPublic'

const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Version = z.number().int().min(1).max(2147483646)
/** Only transport/capture identities are excluded. The stored receipts remain
 * untouched; their full IDs/digests/times are retained separately. */
export const TransferRecoveryEvidenceSchema = TransferRecoveryReconciliationInvariantSchema.omit({
  captureId: true,
  invocationDigest: true
})
  .extend({
    observation: TransferRecoveryReconciliationInvariantSchema.shape.observation.omit({ envelopeDigest: true })
  })
  .strict()
export function recoveryReviewEvidence(value: unknown) {
  const receipt = TransferRecoveryReconciliationReceiptSchema.parse(value)
  const { captureId: _capture, invocationDigest: _invocation, observation, ...rest } = receipt.invariant
  const { envelopeDigest: _envelope, ...physical } = observation
  return TransferRecoveryEvidenceSchema.parse({ ...rest, observation: physical })
}
const PlanSnapshot = z
  .object({
    id: Id,
    tenant_id: z.string().min(1),
    client_id: Id,
    status: z.literal('active'),
    plan_key: z.string().min(1),
    active_site_limit: z.literal(1),
    pages_per_site_limit: z.number().int().positive(),
    storage_bytes_limit: z.number().int().nonnegative().safe(),
    custom_domain_limit: z.number().int().nonnegative(),
    monthly_ai_operation_limit: z.literal(0),
    monthly_build_limit: z.number().int().nonnegative(),
    monthly_traffic_bytes_limit: z.number().int().nonnegative().safe(),
    portal_creation_enabled: z.literal(false),
    effective_from: z.string().datetime({ offset: true }),
    effective_until: z.string().datetime({ offset: true }),
    plan_metadata: z.record(z.string(), z.unknown()),
    created_by: Id,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
export const TransferRecoveryReviewSchema = z
  .object({
    formatVersion: z.literal(1),
    reviewId: Id,
    revision: Version,
    evidence: TransferRecoveryEvidenceSchema,
    evidenceDigest: Digest,
    originalCapture: z.object({ captureId: Id, digest: Digest }).strict(),
    renewal: z
      .object({
        auditId: Id,
        requestId: Id,
        entitlementId: Id,
        auditDigest: Digest,
        entitlementDigest: Digest,
        entitlementSnapshot: PlanSnapshot
      })
      .strict(),
    maximumDeadline: Instant,
    remainingWork: z.literal('same-operation-source-through-retention')
  })
  .strict()
export async function verifyRecoveryReview(value: unknown, digest: string) {
  const review = TransferRecoveryReviewSchema.parse(value)
  if (
    (await collectionDigest(review)) !== digest ||
    (await collectionDigest(review.evidence)) !== review.evidenceDigest ||
    (await collectionDigest(review.renewal.entitlementSnapshot)) !== review.renewal.entitlementDigest
  )
    throw new Error('Recovery review identity mismatch')
  return review
}
