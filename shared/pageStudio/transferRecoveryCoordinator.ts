import { z } from 'zod'
import { TransferControlsOperatorSchema } from './transferControls'
import { TransferRecoveryInspectionRequestSchema } from './transferRecoveryInspection'

const Id = z.string().uuid()
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const TransferRecoveryInspectActionSchema = z.object({ action: z.literal('inspect'),
  expectedRevision: z.number().int().positive().max(2147483646), expectedHeadVersion: z.literal(1),
  recoveryId: Id, captureId: Id }).strict()
export const TransferRecoveryInspectInputSchema = z.object({ siteId: Id, requestId: Id,
  operator: TransferControlsOperatorSchema, body: TransferRecoveryInspectActionSchema }).strict()
export const TransferRecoveryInitialClosureResultSchema = z.object({
  kind: z.enum(['created-initial-closure', 'verified-initial-closure']),
  head: TransferRecoveryInspectionRequestSchema.options[1].shape.transition.shape.next,
  eventId: Id, historicalProofDigest: Digest, verificationDigest: Digest
}).strict()
/** Public evidence summary only. No private source, login or provider details. */
export const TransferRecoveryInspectionViewSchema = z.object({ siteId: Id, requestId: Id,
  revision: z.number().int().positive().max(2147483646), recoveryId: Id, captureId: Id,
  state: z.literal('observed'), historical: z.boolean(), digest: Digest,
  observedStartedAt: z.string().datetime(), observedCompletedAt: z.string().datetime()
}).strict()
