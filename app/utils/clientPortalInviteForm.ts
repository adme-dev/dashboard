export interface ClientPortalInviteForm {
  clientId: string | null
  email: string
  name: string
  permissions: {
    canViewProjects: boolean
    canViewInvoices: boolean
    canApproveWork: boolean
    canViewTimeEntries: boolean
    canViewBudgets: boolean
    canViewAnalytics: boolean
    canNominateCompetitors: boolean
    canSubmitRequests: boolean
    canViewCrm: boolean
    canEditCrm: boolean
    canAdminCrm: boolean
  }
}

export function createClientPortalInviteForm(clientId: string | null = null): ClientPortalInviteForm {
  return {
    clientId,
    email: '',
    name: '',
    permissions: {
      canViewProjects: true,
      canViewInvoices: true,
      canApproveWork: false,
      canViewTimeEntries: false,
      canViewBudgets: false,
      canViewAnalytics: true,
      canNominateCompetitors: false,
      canSubmitRequests: true,
      canViewCrm: true,
      canEditCrm: false,
      canAdminCrm: false
    }
  }
}
