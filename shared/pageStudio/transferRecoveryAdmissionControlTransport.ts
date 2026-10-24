import { z } from 'zod'
import { collectionCanonical } from './collectionApi'
import { managementResultSchema } from './managementResult'
import { TransferRecoveryAdmissionControlInputSchema, TransferRecoveryAdmissionControlViewSchema } from './transferRecoveryAdmissionControl'
export const RecoveryAdmissionControlTransportSchema = TransferRecoveryAdmissionControlInputSchema.extend({ expectedEnvironment: z.literal('production') }).strict()
export const RECOVERY_ADMISSION_CONTROL_URL = 'https://page-studio-management.internal/transfer-recovery-admission-control'
export const RECOVERY_ADMISSION_CONTROL_UNAVAILABLE = 'Transfer readiness could not be confirmed. Refresh the saved admission before continuing.'
export const RecoveryAdmissionControlResponseSchema = managementResultSchema(TransferRecoveryAdmissionControlViewSchema,
  z.object({ statusCode: z.number().int().min(400).max(599), message: z.literal(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE) }).strict())
export function matchesRecoveryAdmissionControl(view: z.infer<typeof TransferRecoveryAdmissionControlViewSchema>, input: z.infer<typeof RecoveryAdmissionControlTransportSchema>) {
  if (view.siteId !== input.siteId || view.requestId !== input.requestId || view.expectedRevision !== input.expectedRevision || view.action !== input.request.action) return false
  if (input.request.action === 'read') return true
  if (view.admissionId !== input.request.admissionId) return false
  return input.request.action !== 'begin' || collectionCanonical(view.review) === collectionCanonical(input.request.review)
}
