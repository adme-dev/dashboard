/**
 * Shared permission constants for role-based access control (frontend mirror).
 * Auto-imported by Nuxt from app/utils/.
 */
export const PERMISSIONS = {
  ADMIN: ['owner', 'admin'],
  MANAGEMENT: ['owner', 'admin', 'lead', 'project_manager'],
  FINANCE: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts'],
  SALES: ['owner', 'admin', 'lead', 'project_manager', 'sales'],
  CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'account_manager', 'sales'],
  CREATIVE: ['owner', 'admin', 'lead', 'project_manager', 'creative', 'producer'],
  MEDIA_BUYING: ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'],
  TIME_APPROVALS: ['owner', 'admin', 'lead', 'project_manager'],
  AUTOMATION: ['owner', 'admin', 'lead', 'project_manager'],
} as const

export function isReadOnlyRole(role: string): boolean {
  return role === 'viewer' || role === 'guest'
}
