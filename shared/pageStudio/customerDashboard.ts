import { z } from 'zod'
import type { CustomerManagedTransfer } from './customerManagedTransfer'

export const CustomerProvisioningRecoverySchema = z.object({
  recoveryId: z.string().uuid(), expectedRecoveryId: z.string().uuid().nullable(), expectedJobDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

export interface CustomerDashboard {
  managedTransfer?: CustomerManagedTransfer | null
  siteId?: string
  businessName: string
  businessType: string
  timezone: string
  state: 'recovery-required' | 'setup-required' | 'approval-pending' | 'available' | 'preparing' | 'verification-pending' | 'editor-ready' | 'transfer-pending' | 'connection-pending' | 'needs-attention' | 'unavailable'
  stage: number
  canCreate: boolean
  canRetry: boolean
  canOpenStudio?: boolean
  canPrepareCms?: boolean
  recovery?: Omit<z.infer<typeof CustomerProvisioningRecoverySchema>, 'recoveryId'>
}
