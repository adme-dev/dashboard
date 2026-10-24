/** Private fresh freeze authority. This acknowledgment never acquires or executes an effect. */
export { TransferRecoverySourceFreezeRequestSchema, TransferRecoverySourceFreezeAcknowledgmentSchema } from './transferRecoverySourceFreeze'
export const TRANSFER_RECOVERY_SOURCE_FREEZE_URL = 'https://page-studio-management.internal/transfer-recovery-source-freeze'
export const TRANSFER_RECOVERY_SOURCE_FREEZE_PATH = '/internal/page-studio/managed-transfers/recovery/source-freeze'
export const TRANSFER_RECOVERY_SOURCE_FREEZE_UNAVAILABLE = 'Current transfer recovery source freeze authority is unavailable'
export const TRANSFER_RECOVERY_SOURCE_FREEZE_MAX_BYTES = 32768
