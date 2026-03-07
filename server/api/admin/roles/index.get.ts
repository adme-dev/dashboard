import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const roles = await queryRows(`
    SELECT
      cr.id,
      cr.name,
      cr.slug,
      cr.description,
      cr.color,
      cr.icon,
      cr.is_system,
      cr.is_read_only,
      cr.sort_order,
      cr.created_at,
      cr.updated_at,
      COALESCE(
        array_agg(rpg.permission_group ORDER BY rpg.permission_group)
        FILTER (WHERE rpg.permission_group IS NOT NULL),
        '{}'
      ) AS permission_groups,
      (SELECT COUNT(*)::int FROM team_members tm WHERE tm.custom_role_id = cr.id) AS member_count
    FROM custom_roles cr
    LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
    GROUP BY cr.id
    ORDER BY cr.sort_order ASC, cr.name ASC
  `)

  return {
    roles: roles.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      color: r.color,
      icon: r.icon,
      isSystem: r.is_system,
      isReadOnly: r.is_read_only,
      sortOrder: r.sort_order,
      permissionGroups: r.permission_groups,
      memberCount: r.member_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }
})
