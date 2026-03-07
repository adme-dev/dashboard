import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const roleId = getRouterParam(event, 'id')
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID is required' })
  }

  const members = await queryRows(
    `SELECT id, name, email, avatar_url
     FROM team_members
     WHERE custom_role_id = $1 AND is_active = true
     ORDER BY name ASC`,
    [roleId]
  )

  return {
    members: members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatar_url,
    }))
  }
})
