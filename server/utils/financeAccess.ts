import { createError, type H3Event } from 'h3'
import type { PermissionGroup } from '~~/server/utils/permissions'
import { queryOneFresh } from '~~/server/utils/db'

/**
 * Explicit authority comes only from an active member's current database role grant.
 * A selected custom role replaces the legacy/system role; cached context, role
 * defaults, development mode and God mode never supply a permission grant.
 */
export async function assertPermissionGrant(_event: H3Event, userId: string, group: PermissionGroup, write = false): Promise<void> {
  let grant: { permission_group: string } | null
  try {
    grant = await queryOneFresh<{ permission_group: string }>(`
      SELECT rpg.permission_group
      FROM team_members tm
      JOIN custom_roles cr ON (
        (tm.custom_role_id IS NOT NULL AND cr.id=tm.custom_role_id)
        OR (tm.custom_role_id IS NULL AND cr.slug=tm.user_role::text AND cr.is_system=TRUE)
      )
      JOIN role_permission_groups rpg ON rpg.role_id=cr.id AND rpg.permission_group=$3
      WHERE tm.id=$1 AND tm.is_active=TRUE
        AND ($2::boolean=FALSE OR (cr.is_read_only=FALSE AND tm.user_role::text NOT IN ('viewer','guest')))
      LIMIT 1`, [userId, write, group])
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Permission verification unavailable' })
  }
  if (grant?.permission_group !== group) {
    throw createError({ statusCode: 403, statusMessage: 'Explicit permission required' })
  }
}

export function assertFinancePermission(event: H3Event, userId: string, write = false): Promise<void> {
  return assertPermissionGrant(event, userId, 'FINANCE', write)
}
