/** Dedicated private read-only recovery phase authority. Never aliases legacy admission. */
export { TransferRecoveryPhaseRequestSchema, TransferRecoveryPhaseAcknowledgmentSchema } from './transferRecoveryPhase'
export const TRANSFER_RECOVERY_PHASE_URL = 'https://page-studio-management.internal/transfer-recovery-phase'
export const TRANSFER_RECOVERY_PHASE_PATH = '/internal/page-studio/managed-transfers/recovery/phase'
export const TRANSFER_RECOVERY_PHASE_UNAVAILABLE = 'Current transfer recovery phase authority is unavailable'
export const TRANSFER_RECOVERY_PHASE_MAX_BYTES = 16384
