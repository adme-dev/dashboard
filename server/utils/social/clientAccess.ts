import { createError, type H3Event } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'

const SOCIAL_PERMISSION_GROUPS: PermissionGroup[] = ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE']
const ALL_CLIENT_PERMISSION_GROUPS: PermissionGroup[] = ['ADMIN', 'MANAGEMENT']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SocialAccessUser = Pick<User, 'role' | 'permissionGroups'>

function hasPermissionGroup(user: SocialAccessUser, group: PermissionGroup) {
  return roleHasPermission(user.role, group) || user.permissionGroups?.includes(group)
}

export function hasSocialClientPermission(user: SocialAccessUser) {
  return SOCIAL_PERMISSION_GROUPS.some(group => hasPermissionGroup(user, group))
}

export function hasAllSocialClientAccess(user: SocialAccessUser) {
  return ALL_CLIENT_PERMISSION_GROUPS.some(group => hasPermissionGroup(user, group))
}

export function isSocialClientId(value: string | undefined | null) {
  return !!value && UUID_RE.test(value)
}

export async function requireSocialClientAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireAuth(event)

  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  }
  if (!isSocialClientId(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  }
  if (!hasSocialClientPermission(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient permissions' })
  }
  if (hasAllSocialClientAccess(user)) {
    return user
  }

  const row = await queryOne(
    `SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 LIMIT 1`,
    [clientId, user.id]
  )
  if (!row) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this client' })
  }

  return user
}

export async function requireAllSocialClientAccess(event: H3Event) {
  const user = await requireAuth(event)
  if (!hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to all social clients' })
  }
  return user
}

export async function requireSocialClientScope(event: H3Event, clientId: string | undefined) {
  return clientId ? requireSocialClientAccess(event, clientId) : requireAllSocialClientAccess(event)
}
