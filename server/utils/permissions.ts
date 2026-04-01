/**
 * Shared permission constants for role-based access control.
 * Each array lists the roles allowed to access a given feature area.
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
  INVOICE_OWN_CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts', 'account_manager'],
} as const

export function isReadOnlyRole(role: string): boolean {
  return role === 'viewer' || role === 'guest'
}

// Permission groups for dynamic role resolution
export const PERMISSION_GROUPS = [
  'ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS',
  'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'
] as const

export type PermissionGroup = typeof PERMISSION_GROUPS[number]

// Static fallback: maps system role slugs to their default permission groups
export const SYSTEM_ROLE_PERMISSIONS: Record<string, PermissionGroup[]> = {
  owner: ['ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'],
  admin: ['ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'],
  lead: ['MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'],
  project_manager: ['MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'],
  account_manager: ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'],
  creative: ['CREATIVE'],
  media_buyer: ['MEDIA_BUYING'],
  producer: ['CREATIVE'],
  finance: ['FINANCE', 'INVOICE_OWN_CLIENTS'],
  accounts: ['FINANCE', 'INVOICE_OWN_CLIENTS'],
  developer: [],
  sales: ['SALES', 'CLIENTS'],
  member: [],
  viewer: [],
  guest: [],
}

// Reverse-lookup: given a PERMISSIONS array, find the first matching group name
export function permissionGroupForRoles(roles: readonly string[]): PermissionGroup | null {
  const key = roles.join(',')
  for (const [group, groupRoles] of Object.entries(PERMISSIONS)) {
    if ((groupRoles as readonly string[]).join(',') === key) return group as PermissionGroup
  }
  return null
}

// Reverse-lookup: given a PERMISSIONS array, find ALL matching group names.
// Multiple groups can share the same role array (e.g. MANAGEMENT, TIME_APPROVALS, AUTOMATION).
export function permissionGroupsForRoles(roles: readonly string[]): PermissionGroup[] {
  const key = roles.join(',')
  const matches: PermissionGroup[] = []
  for (const [group, groupRoles] of Object.entries(PERMISSIONS)) {
    if ((groupRoles as readonly string[]).join(',') === key) matches.push(group as PermissionGroup)
  }
  return matches
}
