import type { PermissionGroup } from '~~/server/utils/permissions'

/** Client scope only: this does not supply management or accounting permissions. */
export function canAccessAllActiveClients(groups: readonly PermissionGroup[] | undefined): boolean {
  return groups?.some(group => group === 'ADMIN' || group === 'MANAGEMENT' || group === 'MARKETING_MANAGEMENT') === true
}
