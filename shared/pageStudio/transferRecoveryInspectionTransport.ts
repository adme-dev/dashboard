/** Private service binding only; never a browser-selected endpoint. */
import { z } from 'zod'
import { TransferRecoveryInspectionRequestSchema, TransferRecoveryInspectionAcknowledgmentSchema } from './transferRecoveryInspection'
import { TransferRecoveryInventoryRequestSchema, TransferRecoveryInventoryAcknowledgmentSchema } from './transferRecoveryInventory'
export const TRANSFER_RECOVERY_INSPECTION_URL = 'https://page-studio-management.internal/transfer-recovery-inspection'
export const TRANSFER_RECOVERY_INSPECTION_PATH = '/internal/page-studio/managed-transfers/recovery/inspect'
export const TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE = 'Current transfer recovery inspection is unavailable'

// Each purpose retains its own strict domain schema and fresh authority helper.
export const TransferRecoveryInspectionWireSchema = z.union([TransferRecoveryInspectionRequestSchema, TransferRecoveryInventoryRequestSchema])
export const TransferRecoveryInspectionWireAcknowledgmentSchema = z.union([TransferRecoveryInspectionAcknowledgmentSchema, TransferRecoveryInventoryAcknowledgmentSchema])
