export interface BannerTemplatePermissionUser {
  id: string
  role: string
  permissionGroups?: readonly string[]
  isCustomReadOnly?: boolean
}

export interface BannerTemplateOwnership {
  createdBy?: string | null
  isSystem?: boolean
}

const creativeRoles = ['owner', 'admin', 'lead', 'project_manager', 'creative', 'producer']

/** Shared by template controls and the server's locked ownership check. */
export function canDeleteBannerTemplate(
  user: BannerTemplatePermissionUser | null | undefined,
  template: BannerTemplateOwnership | null | undefined
): boolean {
  if (!user || !template || user.isCustomReadOnly || ['viewer', 'guest'].includes(user.role)) return false
  const hasCreativeAccess = creativeRoles.includes(user.role) || user.permissionGroups?.includes('CREATIVE') === true
  if (!hasCreativeAccess) return false
  const isAdmin = ['owner', 'admin'].includes(user.role) || user.permissionGroups?.includes('ADMIN') === true
  return isAdmin || (!template.isSystem && template.createdBy === user.id)
}
