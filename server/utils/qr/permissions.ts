import type { H3Event } from 'h3'
import { createError } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { accessibleClientIds, isUuid } from '~~/server/utils/client-access'
import { canAccessQrCodes, hasAgencyQrAccess, type QrPermissionSubject } from '~~/shared/qr/permissions'
import { QR_ACCESS_TEAM_IDS } from '~~/shared/qr/teams'

/** Never cache a team-derived grant or modify the shared authenticated user. */
export async function withQrTeamPermission(user: User & { isCustomReadOnly?: boolean }): Promise<User> {
  if (user.isCustomReadOnly || ['viewer', 'guest'].includes(user.role) || hasAgencyQrAccess(user)) return user
  const membership = await queryOneFresh<{ allowed: boolean }>(
    `SELECT true AS allowed FROM team_memberships m
     JOIN teams t ON t.id=m.team_id AND t.is_active = true
     JOIN team_members member ON member.id=m.team_member_id AND member.is_active=true
     WHERE m.team_member_id=$1 AND t.id=ANY($2::uuid[]) LIMIT 1`,
    [user.id, [...QR_ACCESS_TEAM_IDS]]
  )
  return membership?.allowed
    ? { ...user, permissionGroups: [...(user.permissionGroups ?? []), 'QR_CODES'] }
    : user
}

export async function requireQrAccess(event: H3Event) {
  const user = await withQrTeamPermission(await requireAuth(event))
  if (!canAccessQrCodes(user)) throw createError({ statusCode: 403, statusMessage: 'QR code access required' })
  return user
}

export async function accessibleQrClientIds(user: QrPermissionSubject & { id: string }): Promise<string[] | null> {
  return hasAgencyQrAccess(user) ? null : accessibleClientIds(user)
}

export async function requireQrClientAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireQrAccess(event)
  if (!isUuid(clientId)) throw createError({ statusCode: 400, statusMessage: 'Valid clientId is required' })
  if (hasAgencyQrAccess(user)) return user
  const assigned = await queryOne(
    'SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 LIMIT 1',
    [clientId, user.id]
  )
  if (!assigned) throw createError({ statusCode: 403, statusMessage: 'No access to this client' })
  return user
}
