import { createError, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { PERMISSION_GROUPS, isReadOnlyRole, type PermissionGroup } from '~~/server/utils/permissions'

export interface FreshStaffRoleAuthority {
  userId: string
  role: string
  roleId: string | null
  customRoleId: string | null
  permissionGroups: PermissionGroup[]
  readOnly: boolean
}

/** Exactly the assigned custom role, or its current seeded system row. No static role/Finance fallback. */
export async function resolveFreshStaffRoleAuthority(event: H3Event, userId: string, dependencies = { authenticate: requireAuth, rows: queryRowsFresh }): Promise<FreshStaffRoleAuthority> {
  const user = await dependencies.authenticate(event)
  if (user.id !== userId) throw createError({ statusCode: 403, statusMessage: 'Staff actor mismatch' })
  const rows = await dependencies.rows<{
    role: string
    role_id: string | null
    custom_role_id: string | null
    is_read_only: boolean | null
    permission_groups: string[]
  }>(`SELECT tm.user_role::text AS role,tm.custom_role_id::text,cr.id::text AS role_id,cr.is_read_only,
    COALESCE(array_agg(rpg.permission_group) FILTER (WHERE rpg.permission_group IS NOT NULL),'{}') AS permission_groups
    FROM team_members tm LEFT JOIN custom_roles cr ON (
      (tm.custom_role_id IS NOT NULL AND cr.id=tm.custom_role_id)
      OR (tm.custom_role_id IS NULL AND cr.slug=tm.user_role::text AND cr.is_system=TRUE))
    LEFT JOIN role_permission_groups rpg ON rpg.role_id=cr.id
    WHERE tm.id=$1 AND tm.is_active=TRUE GROUP BY tm.id,cr.id LIMIT 1`, [userId]).catch(() => {
    throw createError({ statusCode: 503, statusMessage: 'Fresh staff authority unavailable' })
  })
  const row = rows[0]
  if (!row) throw createError({ statusCode: 403, statusMessage: 'Active staff authority required' })
  if (!Array.isArray(row.permission_groups)) throw createError({ statusCode: 503, statusMessage: 'Fresh staff authority malformed' })
  return { userId, role: row.role, roleId: row.role_id, customRoleId: row.custom_role_id,
    permissionGroups: row.permission_groups.filter((group): group is PermissionGroup => PERMISSION_GROUPS.includes(group as PermissionGroup)),
    readOnly: !row.role_id || row.is_read_only !== false || isReadOnlyRole(row.role) }
}
