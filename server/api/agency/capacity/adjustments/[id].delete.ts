/**
 * Delete Capacity Adjustment
 * DELETE /api/agency/capacity/adjustments/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const adjustmentId = getRouterParam(event, 'id')

  if (!adjustmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Adjustment ID is required'
    })
  }

  try {
    const adjustment = await queryOne(`
      DELETE FROM capacity_adjustments
      WHERE id = $1
      RETURNING id, team_member_id, adjustment_type, start_date, end_date
    `, [adjustmentId])

    if (!adjustment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Adjustment not found'
      })
    }

    return {
      success: true,
      deleted: {
        id: adjustment.id,
        teamMemberId: adjustment.team_member_id,
        type: adjustment.adjustment_type,
        startDate: adjustment.start_date,
        endDate: adjustment.end_date
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete capacity adjustment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete capacity adjustment'
    })
  }
})
