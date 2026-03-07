import { queryOne, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner'])

  const roleId = getRouterParam(event, 'id')
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID is required' })
  }

  const role = await queryOne<{ id: string; is_system: boolean; name: string }>(
    'SELECT id, is_system, name FROM custom_roles WHERE id = $1',
    [roleId]
  )

  if (!role) {
    throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  }

  if (role.is_system) {
    throw createError({ statusCode: 409, statusMessage: 'System roles cannot be deleted' })
  }

  // Check for assigned members
  const memberCount = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM team_members WHERE custom_role_id = $1',
    [roleId]
  )

  if (memberCount && memberCount.count > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete role "${role.name}" — ${memberCount.count} member(s) are still assigned to it`
    })
  }

  await execute('DELETE FROM custom_roles WHERE id = $1', [roleId])

  return { success: true }
})
