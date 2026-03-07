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

// Permission groups for dynamic role resolution
export const PERMISSION_GROUPS = [
  'ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS',
  'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION'
] as const

export type PermissionGroup = typeof PERMISSION_GROUPS[number]

// Reverse-lookup: given a PERMISSIONS array, find the group name
export function permissionGroupForRoles(roles: readonly string[]): PermissionGroup | null {
  const key = roles.join(',')
  for (const [group, groupRoles] of Object.entries(PERMISSIONS)) {
    if ((groupRoles as readonly string[]).join(',') === key) return group as PermissionGroup
  }
  return null
}
