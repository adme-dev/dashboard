import { z } from 'zod'
import { TransferControlsOperatorSchema } from './transferControls'
import { TransferRecoveryRequestSchema, TransferRecoveryStatusRequestSchema, TransferRecoveryViewSchema } from './transferRecovery'
import { managementResultSchema } from './managementResult'

export const TRANSFER_RECOVERY_URL = 'https://page-studio-management.internal/transfer-recovery'
export const TRANSFER_RECOVERY_UNAVAILABLE = 'Recovery status could not be confirmed. Refresh the saved request before continuing.'
const identity = { siteId: z.string().uuid(), requestId: z.string().uuid(), operator: TransferControlsOperatorSchema,
  expectedEnvironment: z.literal('production') }
export const TransferRecoveryTransportSchema = z.union([
  TransferRecoveryStatusRequestSchema.extend({ ...identity, action: z.literal('status') }).strict(),
  ...TransferRecoveryRequestSchema.options.map(schema => schema.extend(identity).strict())
])
export const TransferRecoveryResponseSchema = managementResultSchema(TransferRecoveryViewSchema,
  z.object({ statusCode: z.number().int().min(400).max(599), message: z.literal(TRANSFER_RECOVERY_UNAVAILABLE) }).strict())
