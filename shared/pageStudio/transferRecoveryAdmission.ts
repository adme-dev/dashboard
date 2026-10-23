import { z } from 'zod'
import { TransferRecoveryInventoryRequestSchema } from './transferRecoveryInventory'
import { ManagedTransferRecoveryInventorySchema } from './transferRecoveryReconciliation'
import {
  TransferRecoveryReviewRouteSchema,
  TransferRecoveryReviewOperatorSchema,
  TransferRecoveryReviewReferenceSchema
} from './transferRecoveryReview'

const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/),
  Version = z.number().int().positive().max(2147483646)
export const RecoveryAdmissionDeadlineSchema = z
  .string()
  .datetime({ precision: 3 })
  .refine((value) => new Date(value).toISOString() === value)
/** PG is read as exact UTC microsecond text. Unsupported precision fails before
 * admission; no truncated Date object is ever claimed to equal the database. */
export function canonicalRecoveryAdmissionDeadline(exactPgText: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}000Z$/.test(exactPgText))
    throw new Error('Unsupported recovery deadline precision')
  return RecoveryAdmissionDeadlineSchema.parse(exactPgText.slice(0, -4) + 'Z')
}
const Identity = { operationId: Id, intentDigest: Digest, recoveryId: Id, epoch: z.literal(1) }
const GrantIdentity = {
  formatVersion: z.literal(1),
  ...Identity,
  admissionId: Id,
  reviewId: Id,
  revision: Version,
  reviewDigest: Digest,
  reconciliationDigest: Digest,
  deadline: RecoveryAdmissionDeadlineSchema
}
export const TransferRecoveryPendingGrantBodySchema = z
  .object({ ...GrantIdentity, pgVersion: z.literal(3), prepareEventId: Id, enableEventId: Id })
  .strict()
  .refine(
    (value) =>
      value.prepareEventId !== value.enableEventId &&
      value.prepareEventId !== value.recoveryId &&
      value.enableEventId !== value.recoveryId
  )
export const TransferRecoveryAppliedGrantBodySchema = z
  .object({ ...GrantIdentity, pgVersion: z.literal(4), pendingDigest: Digest, preparedDigest: Digest })
  .strict()
export const TransferRecoveryPendingGrantSchema = z
  .object({ body: TransferRecoveryPendingGrantBodySchema, digest: Digest })
  .strict()
export const TransferRecoveryAppliedGrantSchema = z
  .object({ body: TransferRecoveryAppliedGrantBodySchema, digest: Digest })
  .strict()
const Empty = {
  admissionId: z.null(),
  appliedDigest: z.null(),
  deadline: z.null(),
  pendingDigest: z.null(),
  preparedDigest: z.null(),
  reconciliationDigest: z.null(),
  reviewDigest: z.null(),
  revision: z.null()
}
export const TransferRecoveryClosedHeadSchema = z
  .object({ ...Identity, ...Empty, mode: z.literal('closed'), version: z.literal(1) })
  .strict()
const Admission = {
  admissionId: Id,
  deadline: RecoveryAdmissionDeadlineSchema,
  pendingDigest: Digest,
  reconciliationDigest: Digest,
  reviewDigest: Digest,
  revision: Version
}
export const TransferRecoveryPreparedHeadSchema = z
  .object({
    ...Identity,
    ...Admission,
    appliedDigest: z.null(),
    mode: z.literal('prepared'),
    preparedDigest: Digest,
    version: z.literal(2)
  })
  .strict()
export const TransferRecoveryEnabledHeadSchema = TransferRecoveryPreparedHeadSchema.extend({
  appliedDigest: Digest,
  mode: z.literal('enabled'),
  version: z.literal(3)
}).strict()
export const TransferRecoveryPrepareStorageSchema = z
  .object({
    purpose: z.literal('prepare'),
    eventId: Id,
    previous: TransferRecoveryClosedHeadSchema,
    admission: z.object(Admission).strict()
  })
  .strict()
export const TransferRecoveryEnableStorageSchema = z
  .object({
    purpose: z.literal('enable'),
    eventId: Id,
    previous: TransferRecoveryPreparedHeadSchema,
    appliedDigest: Digest
  })
  .strict()
const Base = TransferRecoveryInventoryRequestSchema.omit({ purpose: true, recovery: true })
  .extend({ pending: TransferRecoveryPendingGrantSchema, approvedObservation: ManagedTransferRecoveryInventorySchema })
  .strict()
export const TransferRecoveryAdmissionRequestSchema = z.discriminatedUnion('purpose', [
  Base.extend({
    purpose: z.literal('admission-pending'),
    recovery: z.union([TransferRecoveryClosedHeadSchema, TransferRecoveryPreparedHeadSchema]),
    applied: z.null()
  }).strict(),
  Base.extend({
    purpose: z.literal('admission-applied'),
    recovery: z.union([TransferRecoveryPreparedHeadSchema, TransferRecoveryEnabledHeadSchema]),
    applied: TransferRecoveryAppliedGrantSchema
  }).strict()
])
export const TransferRecoveryAdmissionAcknowledgmentSchema = z
  .object({ purpose: z.enum(['admission-pending', 'admission-applied']), envelopeDigest: Digest })
  .strict()
export const TransferRecoveryAdmissionObservationSchema = ManagedTransferRecoveryInventorySchema.extend({
  recovery: ManagedTransferRecoveryInventorySchema.shape.recovery
    .extend({ mode: z.enum(['closed', 'prepared', 'enabled']) })
    .strict()
}).strict()
export const TransferRecoveryPreparedVerificationSchema = z
  .object({
    purpose: z.literal('prepared-admission'),
    envelopeDigest: Digest,
    head: TransferRecoveryPreparedHeadSchema,
    prepare: TransferRecoveryPrepareStorageSchema,
    observation: TransferRecoveryAdmissionObservationSchema
  })
  .strict()
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

export type TransferRecoveryAdmissionRequest = z.infer<typeof TransferRecoveryAdmissionRequestSchema>
export type TransferRecoveryAdmissionAcknowledgment = z.infer<typeof TransferRecoveryAdmissionAcknowledgmentSchema>

/** Named physical evidence projection. Actual observations stay untouched. */
export function recoveryAdmissionPhysicalEvidence(input: unknown) {
  const v = TransferRecoveryAdmissionObservationSchema.parse(input)
  return {
    kind: v.kind,
    version: v.version,
    recovery: {
      operationId: v.recovery.operationId,
      intentDigest: v.recovery.intentDigest,
      recoveryId: v.recovery.recoveryId,
      epoch: v.recovery.epoch
    },
    resources: v.resources,
    catalogue: v.catalogue,
    source: v.source,
    destination: v.destination,
    later: v.later,
    noninterference: v.noninterference
  }
}
