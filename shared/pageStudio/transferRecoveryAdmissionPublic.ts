import { z } from 'zod'
import { TransferRecoveryReviewRouteSchema, TransferRecoveryReviewOperatorSchema, TransferRecoveryReviewReferenceSchema } from './transferRecoveryReviewPublic'

// Public input/deadline validation without initializing private cross-store proofs.
const Id = z.string().uuid()
export const RecoveryAdmissionDeadlineSchema = z
  .string()
  .datetime({ precision: 3 })
  .refine(value => new Date(value).toISOString() === value)

export const TransferRecoveryPendingInputSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  body: z
    .object({
      admissionId: Id,
      review: TransferRecoveryReviewReferenceSchema,
      expectedHeadVersion: z.literal(2),
      prepareEventId: Id,
      enableEventId: Id
    })
    .strict()
}).strict()
export const TransferRecoveryAppliedInputSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  body: z.object({ admissionId: Id, expectedHeadVersion: z.literal(3) }).strict()
}).strict()
