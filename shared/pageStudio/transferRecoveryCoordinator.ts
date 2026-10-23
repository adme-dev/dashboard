import { z } from 'zod'
import { TransferRecoveryInspectionRequestSchema } from './transferRecoveryInspection'

export { TransferRecoveryInspectActionSchema, TransferRecoveryInspectInputSchema, TransferRecoveryInspectionViewSchema } from './transferRecoveryCoordinatorPublic'

const Id = z.string().uuid()
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const TransferRecoveryInitialClosureResultSchema = z.object({
  kind: z.enum(['created-initial-closure', 'verified-initial-closure']),
  head: TransferRecoveryInspectionRequestSchema.options[1].shape.transition.shape.next,
  eventId: Id, historicalProofDigest: Digest, verificationDigest: Digest
}).strict()
