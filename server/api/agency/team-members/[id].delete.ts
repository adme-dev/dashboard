/**
 * Delete Team Member
 * DELETE /api/agency/team-members/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Team member ID is required'
    })
  }

  try {
    // Check if team member exists
    const existing = await queryOne(
      'SELECT id, name FROM team_members WHERE id = $1',
      [id]
    )

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Team member not found'
      })
    }

    // Check for dependent records
    const hasTimeEntries = await queryOne(
      'SELECT 1 FROM time_entries WHERE user_id = $1 LIMIT 1',
      [id]
    )

    if (hasTimeEntries) {
      // Soft delete - just deactivate instead of deleting
      await queryOne(
        'UPDATE team_members SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id]
      )
      return {
        success: true,
        message: 'Team member deactivated (has associated time entries)',
        deactivated: true
      }
    }

    // Hard delete if no dependencies
    await queryOne(
      'DELETE FROM team_members WHERE id = $1 RETURNING id',
      [id]
    )

    return {
      success: true,
      message: 'Team member deleted',
      deleted: true
    }
  } catch (error: any) {
    console.error('Failed to delete team member:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete team member'
    })
  }
})
