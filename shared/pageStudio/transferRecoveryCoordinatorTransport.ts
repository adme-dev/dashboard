import { z } from 'zod'
import { TransferControlsOperatorSchema } from './transferControls'
import { TransferRecoveryInspectActionSchema, TransferRecoveryInspectionViewSchema } from './transferRecoveryCoordinatorPublic'
import { managementResultSchema } from './managementResult'
export const TRANSFER_RECOVERY_COORDINATOR_URL = 'https://page-studio-management.internal/transfer-recovery-inspect'
export const TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE = 'Recovery inspection could not be confirmed. Check the saved request before trying again.'
export const TransferRecoveryCoordinatorTransportSchema = TransferRecoveryInspectActionSchema.extend({
  siteId: z.string().uuid(), requestId: z.string().uuid(), operator: TransferControlsOperatorSchema,
  expectedEnvironment: z.literal('production')
}).strict()
export const TransferRecoveryCoordinatorResponseSchema = managementResultSchema(TransferRecoveryInspectionViewSchema,
  z.object({ statusCode: z.number().int().min(400).max(599), message: z.literal(TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE) }).strict())
export function matchesRecoveryInspection(view: z.infer<typeof TransferRecoveryInspectionViewSchema>, request: z.infer<typeof TransferRecoveryCoordinatorTransportSchema>) {
  return view.siteId === request.siteId && view.requestId === request.requestId && view.revision === request.expectedRevision
    && view.recoveryId === request.recoveryId && view.captureId === request.captureId
}
