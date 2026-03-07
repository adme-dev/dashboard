import { queryOne, queryRows, execute, transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { invalidateUserPermissionCache } from '~~/server/utils/roleResolver'
import { PERMISSION_GROUPS } from '~~/server/utils/permissions'

const VALID_GROUPS = new Set(PERMISSION_GROUPS)

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

  // Validate permission groups if provided
  if (body.permissionGroups !== undefined) {
    const invalid = body.permissionGroups.filter(g => !VALID_GROUPS.has(g as any))
    if (invalid.length) {
      throw createError({ statusCode: 400, statusMessage: `Invalid permission groups: ${invalid.join(', ')}` })
    }
  }

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

  // Update role + permission groups in a transaction
  await transaction(async (client) => {
    // Update role fields
    params.push(roleId)
    await client.query(
      `UPDATE custom_roles SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params
    )

    // Replace permission groups if provided
    if (body.permissionGroups !== undefined) {
      await client.query('DELETE FROM role_permission_groups WHERE role_id = $1', [roleId])
      for (const group of body.permissionGroups) {
        await client.query(
          'INSERT INTO role_permission_groups (role_id, permission_group) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, group]
        )
      }
    }
  })

  // Invalidate KV cache for all affected users (includes users with custom_role_id set
  // AND users with matching user_role slug who may not have custom_role_id backfilled)
  const affectedUsers = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE custom_role_id = $1
     UNION
     SELECT tm.id FROM team_members tm
       JOIN custom_roles cr ON cr.slug = tm.user_role::text AND cr.is_system = true
       WHERE cr.id = $1 AND tm.custom_role_id IS NULL`,
    [roleId]
  )
  for (const u of affectedUsers) {
    await invalidateUserPermissionCache(event, u.id)
  }

  return { success: true }
})
