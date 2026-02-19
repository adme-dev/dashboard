/**
 * Delete/Dismiss Budget Alert
 * DELETE /api/agency/budget-alerts/:id
 *
 * Deletes or dismisses a budget alert
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admins and owners can delete alerts
  await requireRole(event, ['owner', 'admin'])

  const alertId = getRouterParam(event, 'id')

  if (!alertId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert ID is required'
    })
  }

  const query = getQuery(event)
  const dismiss = query.dismiss === 'true'

  try {
    // Check if alert exists
    const alert = await queryOne(
      `SELECT id, status FROM budget_alerts WHERE id = $1`,
      [alertId]
    )

    if (!alert) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Budget alert not found'
      })
    }

    if (dismiss) {
      // Soft delete - mark as dismissed
      await queryOne(`
        UPDATE budget_alerts
        SET status = 'dismissed', dismissed_by = $1, dismissed_at = NOW(), updated_at = NOW()
        WHERE id = $2
        RETURNING id
      `, [user.id, alertId])

      return {
        success: true,
        message: 'Budget alert dismissed',
        dismissed: true
      }
    } else {
      // Hard delete
      await queryOne(
        `DELETE FROM budget_alerts WHERE id = $1 RETURNING id`,
        [alertId]
      )

      return {
        success: true,
        message: 'Budget alert deleted',
        deleted: true
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete budget alert:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete budget alert'
    })
  }
})
