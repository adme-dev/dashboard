import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { invalidateUserPermissionCache } from '~~/server/utils/roleResolver'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner'])

  const roleId = getRouterParam(event, 'id')
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID is required' })
  }

  const body = await readBody<{
    name?: string
    description?: string
    color?: string
    icon?: string
    permissionGroups?: string[]
    isReadOnly?: boolean
  }>(event)

  // Fetch existing role
  const role = await queryOne<{ id: string; is_system: boolean; slug: string }>(
    'SELECT id, is_system, slug FROM custom_roles WHERE id = $1',
    [roleId]
  )

  if (!role) {
    throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  }

  // Build update query
  const updates: string[] = ['updated_at = NOW()']
  const params: any[] = []
  let paramIdx = 1

  // System roles: cannot change name/slug
  if (!role.is_system && body.name?.trim()) {
    updates.push(`name = $${paramIdx}`)
    params.push(body.name.trim())
    paramIdx++
  }

  if (body.description !== undefined) {
    updates.push(`description = $${paramIdx}`)
    params.push(body.description?.trim() || null)
    paramIdx++
  }

  if (body.color) {
    updates.push(`color = $${paramIdx}`)
    params.push(body.color)
    paramIdx++
  }

  if (body.icon) {
    updates.push(`icon = $${paramIdx}`)
    params.push(body.icon)
    paramIdx++
  }

  if (!role.is_system && body.isReadOnly !== undefined) {
    updates.push(`is_read_only = $${paramIdx}`)
    params.push(body.isReadOnly)
    paramIdx++
  }

  // Update role
  params.push(roleId)
  await execute(
    `UPDATE custom_roles SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    params
  )

  // Update permission groups if provided
  if (body.permissionGroups !== undefined) {
    await execute('DELETE FROM role_permission_groups WHERE role_id = $1', [roleId])
    for (const group of body.permissionGroups) {
      await execute(
        'INSERT INTO role_permission_groups (role_id, permission_group) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleId, group]
      )
    }
  }

  // Invalidate KV cache for all affected users
  const affectedUsers = await queryRows<{ id: string }>(
    'SELECT id FROM team_members WHERE custom_role_id = $1',
    [roleId]
  )
  for (const u of affectedUsers) {
    await invalidateUserPermissionCache(event, u.id)
    // Also invalidate auth session cache entries (we can't know the token prefix,
    // but the role-perms cache will be refreshed on next request)
  }

  return { success: true }
})
