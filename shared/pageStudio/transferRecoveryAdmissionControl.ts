import { z } from 'zod'
import {
  TransferRecoveryReviewRouteSchema,
  TransferRecoveryReviewOperatorSchema,
  TransferRecoveryReviewReferenceSchema
} from './transferRecoveryReview'
import {
  RecoveryAdmissionDeadlineSchema,
  TransferRecoveryPendingInputSchema
} from './transferRecoveryAdmission'

const Id = z.string().uuid()
export const TransferRecoveryAdmissionControlActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }).strict(),
  TransferRecoveryPendingInputSchema.shape.body
    .extend({ action: z.literal('begin') })
    .strict()
    .refine((v) => v.prepareEventId !== v.enableEventId),
  z.object({ action: z.literal('prepare'), admissionId: Id, expectedHeadVersion: z.literal(3) }).strict(),
  z.object({ action: z.literal('apply'), admissionId: Id, expectedHeadVersion: z.literal(3) }).strict(),
  z.object({ action: z.literal('enable'), admissionId: Id, expectedHeadVersion: z.literal(4) }).strict()
])
export const TransferRecoveryAdmissionControlInputSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  request: TransferRecoveryAdmissionControlActionSchema
}).strict()
export const TransferRecoveryAdmissionControlViewSchema = TransferRecoveryReviewRouteSchema.extend({
  action: z.enum(['read', 'begin', 'prepare', 'apply', 'enable']),
  admissionId: Id.nullable(),
  review: TransferRecoveryReviewReferenceSchema,
  deadline: RecoveryAdmissionDeadlineSchema,
  pgState: z.enum(['approved', 'pending', 'applied']),
  d1State: z.enum(['unverified', 'prepared', 'enabled'])
})
  .strict()
  .refine((v) => {
    if (v.action === 'read')
      return (
        v.d1State === 'unverified' &&
        (v.pgState === 'approved' ? v.admissionId === null : v.admissionId !== null)
      )
    if (v.admissionId === null) return false
    if (v.action === 'begin') return v.pgState === 'pending' && v.d1State === 'unverified'
    if (v.action === 'prepare') return v.pgState === 'pending' && v.d1State === 'prepared'
    if (v.action === 'apply') return v.pgState === 'applied' && v.d1State === 'unverified'
    return v.pgState === 'applied' && v.d1State === 'enabled'
  })
export type TransferRecoveryAdmissionControlInput = z.infer<
  typeof TransferRecoveryAdmissionControlInputSchema
>
export type TransferRecoveryAdmissionControlView = z.infer<typeof TransferRecoveryAdmissionControlViewSchema>
