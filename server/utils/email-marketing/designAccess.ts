import { createError } from 'h3'
import { validateSession } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import {
  SYSTEM_ROLE_PERMISSIONS,
  isReadOnlyRole
} from '~~/server/utils/permissions'

interface AccessRow {
  role: string
  custom_role_id: string | null
  configured_role_id: string | null
  is_read_only: boolean | null
  permission_groups: string[]
  assigned: boolean
  client_active: boolean
}

/** Reuse session/role/assignment owners, but bypass request and KV decisions.
 * Tokens are supplied only by the authenticated HTTP boundary, never action JSON.
 * This grants draft editing or module reading, never library publishing. */
export async function assertFreshDesignAccess(
  token: string,
  actorId: string,
  clientId: string | null,
  access: 'read' | 'write'
): Promise<'staff' | 'designer'> {
  const user = await validateSession(token)
  if (!user || user.id !== actorId)
    throw createError({
      statusCode: 401,
      statusMessage: 'design_session_invalid'
    })
  const row = await queryOneFresh<AccessRow>(
    `
    SELECT tm.user_role::text AS role, tm.custom_role_id,
      cr.id AS configured_role_id, cr.is_read_only,
      ARRAY(SELECT permission_group FROM role_permission_groups WHERE role_id=cr.id) AS permission_groups,
      EXISTS(SELECT 1 FROM client_team_assignments WHERE team_member_id=tm.id AND client_id=$2::uuid) AS assigned,
      EXISTS(SELECT 1 FROM agency_clients WHERE id=$2::uuid AND is_active=TRUE) AS client_active
    FROM team_members tm
    LEFT JOIN custom_roles cr ON cr.id=tm.custom_role_id
      OR (tm.custom_role_id IS NULL AND cr.is_system=TRUE AND cr.slug=tm.user_role::text)
    WHERE tm.id=$1 AND tm.is_active=TRUE`,
    [actorId, clientId]
  )
  const deny = (): never => {
    throw createError({
      statusCode: 403,
      statusMessage: 'design_access_denied'
    })
  }
  if (!row || (row.custom_role_id && !row.configured_role_id)) return deny()
  const groups = row.configured_role_id
    ? row.permission_groups
    : SYSTEM_ROLE_PERMISSIONS[row.role]
  if (
    !groups
    || (access === 'write' && (isReadOnlyRole(row.role) || row.is_read_only))
  )
    return deny()
  const agency = groups.includes('ADMIN') || groups.includes('MANAGEMENT')
  const marketingClient
    = clientId !== null
      && row.client_active
      && groups.includes('MARKETING_MANAGEMENT')
  if (!agency && !(clientId !== null && row.assigned) && !marketingClient)
    return deny()
  return groups.includes('CREATIVE') ? 'designer' : 'staff'
}
