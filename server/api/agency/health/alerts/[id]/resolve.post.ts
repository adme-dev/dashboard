/**
 * Resolve Health Alert
 * POST /api/agency/health/alerts/:id/resolve
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
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
        is_active = false,
        resolved_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [alertId])

    if (!alert) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Alert not found or already resolved'
      })
    }

    return {
      success: true,
      alert: {
        id: alert.id,
        type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        isActive: alert.is_active,
        resolvedAt: alert.resolved_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to resolve alert:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resolve alert'
    })
  }
})
