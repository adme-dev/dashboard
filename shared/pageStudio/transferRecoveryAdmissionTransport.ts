/** Dedicated private admission inspection. Never aliases inventory authority. */
export { TransferRecoveryAdmissionRequestSchema, TransferRecoveryAdmissionAcknowledgmentSchema } from './transferRecoveryAdmission'
export const TRANSFER_RECOVERY_ADMISSION_URL = 'https://page-studio-management.internal/transfer-recovery-admission'
export const TRANSFER_RECOVERY_ADMISSION_PATH = '/internal/page-studio/managed-transfers/recovery/admission'
export const TRANSFER_RECOVERY_ADMISSION_UNAVAILABLE = 'Current transfer recovery admission is unavailable'
export const TRANSFER_RECOVERY_ADMISSION_MAX_BYTES = 16384
