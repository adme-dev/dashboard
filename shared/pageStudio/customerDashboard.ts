import { z } from 'zod'

export const CustomerProvisioningRecoverySchema = z.object({
  recoveryId: z.string().uuid(), expectedRecoveryId: z.string().uuid().nullable(), expectedJobDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

export interface CustomerDashboard {
  businessName: string
  businessType: string
  timezone: string
  state: 'recovery-required' | 'setup-required' | 'approval-pending' | 'available' | 'preparing' | 'verification-pending' | 'needs-attention' | 'unavailable'
  stage: number
  canCreate: boolean
  canRetry: boolean
  canOpenStudio?: boolean
  recovery?: Omit<z.infer<typeof CustomerProvisioningRecoverySchema>, 'recoveryId'>
}
