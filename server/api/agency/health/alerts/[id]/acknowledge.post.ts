/**
 * Acknowledge Health Alert
 * POST /api/agency/health/alerts/:id/acknowledge
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const alertId = getRouterParam(event, 'id')

  if (!alertId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert ID is required'
    })
  }

  try {
    const alert = await queryOne(`
      UPDATE health_alerts
      SET
        acknowledged_by = $1,
        acknowledged_at = NOW()
      WHERE id = $2 AND is_active = true
      RETURNING *
    `, [user.id, alertId])

    if (!alert) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Alert not found or already acknowledged'
      })
    }

    return {
      success: true,
      alert: {
        id: alert.id,
        type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        acknowledgedBy: alert.acknowledged_by,
        acknowledgedAt: alert.acknowledged_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to acknowledge alert:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to acknowledge alert'
    })
  }
})
