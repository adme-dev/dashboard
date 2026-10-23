import { z } from 'zod'
import {
  RecoveryAdmissionDeadlineSchema,
  TransferRecoveryPendingGrantSchema,
  TransferRecoveryAppliedGrantSchema,
  TransferRecoveryEnabledHeadSchema
} from './transferRecoveryAdmission'
import {
  ManagedTransferExecutionContextSchema,
  ManagedTransferExecutionDiscoverySchema
} from './managed-transfer-execution'
import {
  TransferRecoveryReviewRouteSchema,
  TransferRecoveryReviewOperatorSchema
} from './transferRecoveryReview'

const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Inspection = z
  .object({
    operatorId: Id,
    loginSessionHash: Digest,
    pg: z
      .object({
        requestId: Id,
        requestRevision: z.number().int().positive().max(2147483646),
        recoveryId: Id,
        epoch: z.literal(1),
        version: z.literal(4),
        deadline: RecoveryAdmissionDeadlineSchema
      })
      .strict()
  })
  .strict()
const Common = {
  pending: TransferRecoveryPendingGrantSchema,
  applied: TransferRecoveryAppliedGrantSchema,
  recovery: TransferRecoveryEnabledHeadSchema,
  inspection: Inspection
}
/** Private read proof only. A supplied head is not proof of its actual D1 state;
 * the trusted Studio reader independently reads the joined current head/event. */
export const TransferRecoveryEnabledRequestSchema = z
  .object({
    purpose: z.literal('recovery-enabled'),
    ...Common
  })
  .strict()
export const TransferRecoverySourceDiscoveryRequestSchema = z
  .object({
    purpose: z.literal('recovery-phase'),
    ...Common,
    command: z
      .object({
        phase: z.literal('source-execution'),
        verb: z.literal('read'),
        action: z.literal('discover'),
        request: ManagedTransferExecutionContextSchema,
        requestDigest: Digest,
        invocationId: Id
      })
      .strict()
  })
  .strict()
export const TransferRecoveryPhaseRequestSchema = z.discriminatedUnion('purpose', [
  TransferRecoveryEnabledRequestSchema,
  TransferRecoverySourceDiscoveryRequestSchema
])
export const TransferRecoveryPhaseAcknowledgmentSchema = z
  .object({
    purpose: z.enum(['recovery-enabled', 'recovery-phase']),
    envelopeDigest: Digest
  })
  .strict()
export const TransferRecoverySourceDiscoveryResultSchema = z
  .object({
    purpose: z.literal('source-execution-discovery'),
    envelopeDigest: Digest,
    discovery: ManagedTransferExecutionDiscoverySchema
  })
  .strict()
export const TransferRecoverySourceInputSchema = TransferRecoveryReviewRouteSchema.extend({
  operator: TransferRecoveryReviewOperatorSchema,
  body: z.object({ admissionId: Id, invocationId: Id }).strict()
}).strict()
export type TransferRecoveryEnabledRequest = z.infer<typeof TransferRecoveryEnabledRequestSchema>
export type TransferRecoverySourceDiscoveryRequest = z.infer<
  typeof TransferRecoverySourceDiscoveryRequestSchema
>
export type TransferRecoveryPhaseRequest = z.infer<typeof TransferRecoveryPhaseRequestSchema>
