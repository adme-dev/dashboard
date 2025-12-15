/**
 * Acknowledge Budget Alert
 * POST /api/agency/budget-alerts/:id/acknowledge
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert ID is required'
    })
  }

  try {
    // Check alert exists and is active
    const existing = await queryOne(`
      SELECT id, status FROM budget_alerts WHERE id = $1
    `, [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Alert not found'
      })
    }

    if (existing.status !== 'active') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Alert is not active'
      })
    }

    const alert = await queryOne(`
      UPDATE budget_alerts
      SET
        status = 'acknowledged',
        acknowledged_at = NOW(),
        acknowledged_by = $2
      WHERE id = $1
      RETURNING *
    `, [id, user.id])

    return {
      success: true,
      alert: {
        id: alert.id,
        status: alert.status,
        acknowledgedAt: alert.acknowledged_at,
        acknowledgedBy: alert.acknowledged_by
      }
    }
  } catch (error: any) {
    console.error('Failed to acknowledge alert:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to acknowledge alert'
    })
  }
})
