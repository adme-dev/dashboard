import { createError, type H3Event } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import { hasAllSocialClientAccess, isSocialClientId, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export { hasSocialClientPermission as hasBannerClientPermission, isSocialClientId as isBannerClientId } from '~~/server/utils/social/clientAccess'

/** Banner Studio is a shared creative workspace. This authority never grants social or finance access. */
export async function hasAllBannerClientAccess(user: Pick<User, 'id' | 'role' | 'permissionGroups'>): Promise<boolean> {
  if (hasAllSocialClientAccess(user)) return true
  if (!roleHasPermission(user.role, 'CREATIVE') && !user.permissionGroups?.includes('CREATIVE')) return false

  // A current explicit grant is required for the new agency-wide creative authority.
  // A selected custom role replaces the system role; revoked or inactive users cannot
  // regain the full library through a cached role name or permission group.
  try {
    const grant = await queryOneFresh<{ allowed: boolean }>(`
      SELECT TRUE AS allowed
      FROM team_members tm
      JOIN custom_roles cr ON (
        (tm.custom_role_id IS NOT NULL AND cr.id = tm.custom_role_id)
        OR (tm.custom_role_id IS NULL AND cr.is_system = TRUE AND cr.slug = tm.user_role::text)
      )
      JOIN role_permission_groups rpg ON rpg.role_id = cr.id AND rpg.permission_group = 'CREATIVE'
      WHERE tm.id = $1 AND tm.is_active = TRUE
      LIMIT 1`, [user.id])
    return grant?.allowed === true
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Creative permission verification unavailable' })
  }
}

export async function requireBannerClientAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireAuth(event)
  if (!isSocialClientId(clientId)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  if (await hasAllBannerClientAccess(user)) return user
  return requireSocialClientAccess(event, clientId)
}

export async function requireAllBannerClientAccess(event: H3Event) {
  const user = await requireAuth(event)
  if (!await hasAllBannerClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to the full banner library' })
  return user
}

export async function requireBannerClientScope(event: H3Event, clientId: string | undefined) {
  return clientId ? requireBannerClientAccess(event, clientId) : requireAllBannerClientAccess(event)
}
