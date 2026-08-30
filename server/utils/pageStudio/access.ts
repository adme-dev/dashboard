import type { H3Event } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { isReadOnlyRole, type PermissionGroup } from '~~/server/utils/permissions'
import { resolveUserPermissions } from '~~/server/utils/roleResolver'
import { getSelectedTenant } from '~~/server/utils/session'

export type PageStudioPermission = Extract<
  PermissionGroup,
  | 'PAGE_STUDIO_VIEW'
  | 'PAGE_STUDIO_EDIT'
  | 'PAGE_STUDIO_APPROVE'
  | 'PAGE_STUDIO_PUBLISH'
  | 'PAGE_STUDIO_DOMAINS'
  | 'PAGE_STUDIO_SUBSCRIPTIONS'
>

export interface AgencyPageStudioAccess {
  tenantId: string
  user: User
}

export async function requireAgencyPageStudioAccess(
  event: H3Event,
  permission: PageStudioPermission
): Promise<AgencyPageStudioAccess> {
  const user = await requireAuth(event)
  let groups = user.permissionGroups

  if (!groups) {
    const resolved = await resolveUserPermissions(
      event,
      user.id,
      user.role,
      user.custom_role_id ?? null
    )
    groups = resolved.groups
    user.permissionGroups = groups
    ;(user as User & { isCustomReadOnly?: boolean }).isCustomReadOnly
      = resolved.isReadOnly && !isReadOnlyRole(user.role)
  }

  const readOnly
    = isReadOnlyRole(user.role)
      || Boolean((user as User & { isCustomReadOnly?: boolean }).isCustomReadOnly)
  const isMutation = permission !== 'PAGE_STUDIO_VIEW'

  if (!groups.includes(permission) || (isMutation && readOnly)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Page Studio access denied'
    })
  }

  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No organization selected'
    })
  }

  return { tenantId, user }
}
