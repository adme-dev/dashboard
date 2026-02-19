/**
 * Delete/Cancel Brief
 * DELETE /api/agency/briefs/:id
 *
 * Cancels or permanently deletes a brief
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const briefId = getRouterParam(event, 'id')

  if (!briefId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  const query = getQuery(event)
  const hardDelete = query.hard === 'true'

  try {
    // Check if brief exists
    const brief = await queryOne(
      `SELECT id, status, reference_number, converted_to_task_id, converted_to_project_id FROM briefs WHERE id = $1`,
      [briefId]
    )

    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    // Don't allow deleting completed briefs that have been converted
    if (brief.status === 'completed' && (brief.converted_to_task_id || brief.converted_to_project_id)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot delete a brief that has been converted to a task or project'
      })
    }

    if (hardDelete) {
      // Only admins/owners can hard delete
      await requireRole(event, ['owner', 'admin'])

      await transaction(async (client) => {
        // Delete related data first
        await client.query(`DELETE FROM brief_field_values WHERE brief_id = $1`, [briefId])
        await client.query(`DELETE FROM brief_attachments WHERE brief_id = $1`, [briefId])
        await client.query(`DELETE FROM brief_comments WHERE brief_id = $1`, [briefId])
        await client.query(`DELETE FROM brief_activities WHERE brief_id = $1`, [briefId])

        // Delete the brief
        await client.query(`DELETE FROM briefs WHERE id = $1`, [briefId])
      })

      return {
        success: true,
        message: 'Brief permanently deleted',
        deleted: true
      }
    } else {
      // Soft delete - mark as cancelled
      await transaction(async (client) => {
        await client.query(`
          UPDATE briefs
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1
        `, [briefId])

        // Log activity
        await client.query(`
          INSERT INTO brief_activities (brief_id, user_id, activity_type, metadata)
          VALUES ($1, $2, 'cancelled', $3)
        `, [briefId, user.id, JSON.stringify({ reason: 'User cancelled' })])
      })

      return {
        success: true,
        message: 'Brief cancelled successfully',
        cancelled: true
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete brief:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete brief'
    })
  }
})
