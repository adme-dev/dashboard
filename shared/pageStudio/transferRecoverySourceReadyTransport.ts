/** Private read-only readiness authority. No freeze claim or effect is authorized. */
export { TransferRecoverySourceReadyRequestSchema, TransferRecoverySourceReadyAcknowledgmentSchema } from './transferRecoverySourceFreeze'
export const TRANSFER_RECOVERY_SOURCE_READY_URL = 'https://page-studio-management.internal/transfer-recovery-source-ready'
export const TRANSFER_RECOVERY_SOURCE_READY_PATH = '/internal/page-studio/managed-transfers/recovery/source-ready'
export const TRANSFER_RECOVERY_SOURCE_READY_UNAVAILABLE = 'Current transfer recovery source readiness authority is unavailable'
export const TRANSFER_RECOVERY_SOURCE_READY_MAX_BYTES = 16384
