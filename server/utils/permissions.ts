/**
 * Shared permission constants for role-based access control.
 * Each array lists the roles allowed to access a given feature area.
 */
export const PERMISSIONS = {
  ADMIN: ['owner', 'admin'],
  HR_ADMIN: ['owner'],
  MANAGEMENT: ['owner', 'admin', 'lead', 'project_manager'],
  FINANCE: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts'],
  SALES: ['owner', 'admin', 'lead', 'project_manager', 'sales'],
  CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'account_manager', 'sales'],
  CREATIVE: ['owner', 'admin', 'lead', 'project_manager', 'creative', 'producer'],
  MEDIA_BUYING: ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'],
  TIME_APPROVALS: ['owner', 'admin', 'lead', 'project_manager'],
  AUTOMATION: ['owner', 'admin', 'lead', 'project_manager'],
  INVOICE_OWN_CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts', 'account_manager']
} as const

export function isReadOnlyRole(role: string): boolean {
  return role === 'viewer' || role === 'guest'
}

/**
 * Static system-role permission check by group name (e.g. roleHasPermission('finance', 'FINANCE')).
 * Mirrors the existing `PERMISSIONS.X.includes(role)` idiom (see clientScoping.ts). Fail-closed for
 * DB-driven custom roles — they resolve via roleResolver.ts, but the AI tool registry uses this
 * conservative static check pre-send with a handler-time re-check as defense-in-depth (see
 * server/utils/ai/toolRegistry.ts). Denying a custom-role user a tool is safe; granting wrongly is not.
 */
export function roleHasPermission(role: string, group: PermissionGroup): boolean {
  const legacyRoles = PERMISSIONS[group as keyof typeof PERMISSIONS]
  return legacyRoles ? (legacyRoles as readonly string[]).includes(role) : false
}

// Permission groups for dynamic role resolution
export const PERMISSION_GROUPS = [
  'ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS',
  'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS',
  'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE',
  'PAGE_STUDIO_PUBLISH', 'PAGE_STUDIO_DOMAINS', 'PAGE_STUDIO_SUBSCRIPTIONS'
] as const

export type PermissionGroup = typeof PERMISSION_GROUPS[number]

// Page Studio groups intentionally have no matching PERMISSIONS role arrays. `hasRole()` reverse-
// maps identical legacy arrays, so representing PAGE_STUDIO_DOMAINS as ['owner', 'admin'] would let
// a custom role holding only that group pass every legacy ADMIN gate. Page Studio endpoints enforce
// these explicit group names through pageStudio/access.ts instead.

// Static fallback: maps system role slugs to their default permission groups
export const SYSTEM_ROLE_PERMISSIONS: Record<string, PermissionGroup[]> = {
  owner: ['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE', 'PAGE_STUDIO_PUBLISH', 'PAGE_STUDIO_DOMAINS', 'PAGE_STUDIO_SUBSCRIPTIONS'],
  admin: ['ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE', 'PAGE_STUDIO_PUBLISH', 'PAGE_STUDIO_DOMAINS', 'PAGE_STUDIO_SUBSCRIPTIONS'],
  lead: ['MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE', 'PAGE_STUDIO_PUBLISH'],
  project_manager: ['MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE', 'PAGE_STUDIO_PUBLISH'],
  account_manager: ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT'],
  creative: ['CREATIVE', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT'],
  media_buyer: ['MEDIA_BUYING'],
  producer: ['CREATIVE', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT'],
  finance: ['FINANCE', 'INVOICE_OWN_CLIENTS'],
  accounts: ['FINANCE', 'INVOICE_OWN_CLIENTS'],
  developer: [],
  sales: ['SALES', 'CLIENTS'],
  member: [],
  viewer: [],
  guest: []
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
