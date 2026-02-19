/**
 * Update Capacity Adjustment
 * PUT /api/agency/capacity/adjustments/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateAdjustmentBody {
  startDate?: string
  endDate?: string
  hoursPerDay?: number
  adjustedHoursPerDay?: number
  isRecurring?: boolean
  recurrencePattern?: 'weekly' | 'monthly' | 'yearly' | null
  title?: string
  description?: string
  isApproved?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const adjustmentId = getRouterParam(event, 'id')

  if (!adjustmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Adjustment ID is required'
    })
  }

  const body = await readBody<UpdateAdjustmentBody>(event)

  try {
    // Get existing adjustment
    const existing = await queryOne(`
      SELECT * FROM capacity_adjustments WHERE id = $1
    `, [adjustmentId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Adjustment not found'
      })
    }

    // Validate dates if provided
    const startDate = body.startDate ? new Date(body.startDate) : new Date(existing.start_date)
    const endDate = body.endDate ? new Date(body.endDate) : new Date(existing.end_date)

    if (endDate < startDate) {
      throw createError({
        statusCode: 400,
        statusMessage: 'End date must be after start date'
      })
    }

    // Build update
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.startDate !== undefined) {
      updates.push(`start_date = $${idx++}`)
      params.push(body.startDate)
    }

    if (body.endDate !== undefined) {
      updates.push(`end_date = $${idx++}`)
      params.push(body.endDate)
    }

    if (body.hoursPerDay !== undefined) {
      updates.push(`hours_per_day = $${idx++}`)
      params.push(body.hoursPerDay)
    }

    if (body.adjustedHoursPerDay !== undefined) {
      updates.push(`adjusted_hours_per_day = $${idx++}`)
      params.push(body.adjustedHoursPerDay)
    }

    if (body.isRecurring !== undefined) {
      updates.push(`is_recurring = $${idx++}`)
      params.push(body.isRecurring)
    }

    if (body.recurrencePattern !== undefined) {
      updates.push(`recurrence_pattern = $${idx++}`)
      params.push(body.recurrencePattern)
    }

    if (body.title !== undefined) {
      updates.push(`title = $${idx++}`)
      params.push(body.title)
    }

    if (body.description !== undefined) {
      updates.push(`description = $${idx++}`)
      params.push(body.description)
    }

    if (body.isApproved !== undefined) {
      updates.push(`is_approved = $${idx++}`)
      params.push(body.isApproved)

      if (body.isApproved) {
        updates.push(`approved_by = $${idx++}`)
        params.push(user.id)
      }
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided'
      }
    }

    updates.push('updated_at = NOW()')
    params.push(adjustmentId)

    const adjustment = await queryOne(`
      UPDATE capacity_adjustments
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Calculate hours impact
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const hoursImpact = totalDays * (Number(adjustment.hours_per_day) - Number(adjustment.adjusted_hours_per_day))

    return {
      success: true,
      adjustment: {
        id: adjustment.id,
        teamMemberId: adjustment.team_member_id,
        departmentId: adjustment.department_id,
        type: adjustment.adjustment_type,
        startDate: adjustment.start_date,
        endDate: adjustment.end_date,
        hoursPerDay: adjustment.hours_per_day,
        adjustedHoursPerDay: adjustment.adjusted_hours_per_day,
        isRecurring: adjustment.is_recurring,
        recurrencePattern: adjustment.recurrence_pattern,
        title: adjustment.title,
        description: adjustment.description,
        isApproved: adjustment.is_approved,
        totalDays,
        hoursImpact,
        updatedAt: adjustment.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update capacity adjustment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update capacity adjustment'
    })
  }
})
