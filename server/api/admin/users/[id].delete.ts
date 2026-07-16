/**
 * Permanently delete a user
 * DELETE /api/admin/users/:id
 *
 * Hard-deletes the team_members row (plus auth artifacts and team
 * memberships). If the user has linked activity protected by foreign keys
 * (tasks, comments, boards…), the delete is refused with a 409 telling the
 * admin to deactivate instead — deletion is only for accounts that never
 * really participated (demo/duplicate/typo accounts).
 */

import { requireRole, logActivity, invalidateAllSessions, invalidateUserMagicLinks } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const currentUser = await requireRole(event, ['admin', 'owner'])
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }
  if (userId === currentUser.id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete your own account' })
  }

  const target = await queryOne<{ id: string; name: string; email: string; user_role: string }>(
    `SELECT id, name, email, user_role FROM team_members WHERE id = $1`,
    [userId],
  )
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  if (target.user_role === 'owner' && currentUser.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Only an owner can delete an owner account' })
  }

  try {
    // Clean up auth artifacts + memberships first so they can't block the
    // delete; anything else referencing the user is real activity and
    // SHOULD block it.
    await invalidateAllSessions(userId)
    await invalidateUserMagicLinks(userId)
    await execute(`DELETE FROM team_memberships WHERE team_member_id = $1`, [userId])
    await execute(`DELETE FROM team_members WHERE id = $1`, [userId])
  } catch (error: any) {
    if (error?.code === '23503') {
      throw createError({
        statusCode: 409,
        statusMessage: `${target.name} has linked activity (tasks, boards or comments) and can't be deleted. Deactivate them instead — their data is preserved and they lose access.`,
      })
    }
    console.error('[admin/users delete] failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete user' })
  }

  await logActivity({
    userId: currentUser.id,
    action: 'user_deleted',
    resourceType: 'user',
    resourceId: userId,
    metadata: { deletedEmail: target.email, deletedName: target.name },
    event,
  })

  return { success: true, message: `${target.name} permanently deleted` }
})
