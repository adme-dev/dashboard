export interface CustomerDashboard {
  businessName: string
  businessType: string
  timezone: string
  state: 'setup-required' | 'approval-pending' | 'available' | 'preparing' | 'verification-pending' | 'needs-attention' | 'unavailable'
  stage: number
  canCreate: boolean
  canRetry: boolean
}
