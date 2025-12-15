/**
 * Resolve Budget Alert
 * POST /api/agency/budget-alerts/:id/resolve
 *
 * Body:
 * - notes: Resolution notes (optional)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert ID is required'
    })
  }

  try {
    // Check alert exists
    const existing = await queryOne(`
      SELECT id, status FROM budget_alerts WHERE id = $1
    `, [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Alert not found'
      })
    }

    if (existing.status === 'resolved') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Alert is already resolved'
      })
    }

    const alert = await queryOne(`
      UPDATE budget_alerts
      SET
        status = 'resolved',
        resolved_at = NOW(),
        resolution_notes = $2
      WHERE id = $1
      RETURNING *
    `, [id, body.notes || null])

    return {
      success: true,
      alert: {
        id: alert.id,
        status: alert.status,
        resolvedAt: alert.resolved_at,
        resolutionNotes: alert.resolution_notes
      }
    }
  } catch (error: any) {
    console.error('Failed to resolve alert:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resolve alert'
    })
  }
})
