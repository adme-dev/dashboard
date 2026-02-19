/**
 * Create Capacity Adjustment
 * POST /api/agency/capacity/adjustments
 *
 * Creates PTO, time off, or other capacity adjustments
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateAdjustmentBody {
  teamMemberId?: string // null for company-wide
  departmentId?: string // null for individual or company-wide
  adjustmentType: 'pto' | 'sick_leave' | 'holiday' | 'training' | 'conference' | 'reduced_hours' | 'increased_hours' | 'leave_of_absence' | 'other'
  startDate: string
  endDate: string
  hoursPerDay?: number
  adjustedHoursPerDay?: number
  isRecurring?: boolean
  recurrencePattern?: 'weekly' | 'monthly' | 'yearly'
  title?: string
  description?: string
  autoApprove?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateAdjustmentBody>(event)

  // Validation
  if (!body.adjustmentType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Adjustment type is required'
    })
  }

  if (!body.startDate || !body.endDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Start date and end date are required'
    })
  }

  const startDate = new Date(body.startDate)
  const endDate = new Date(body.endDate)

  if (endDate < startDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'End date must be after start date'
    })
  }

  try {
    // Validate team member exists if provided
    if (body.teamMemberId) {
      const teamMember = await queryOne(`
        SELECT id FROM team_members WHERE id = $1
      `, [body.teamMemberId])

      if (!teamMember) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Team member not found'
        })
      }
    }

    // Validate department exists if provided
    if (body.departmentId) {
      const department = await queryOne(`
        SELECT id FROM departments WHERE id = $1
      `, [body.departmentId])

      if (!department) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Department not found'
        })
      }
    }

    const hoursPerDay = body.hoursPerDay ?? 8
    const adjustedHoursPerDay = body.adjustedHoursPerDay ?? 0

    // Auto-approve if requested or for certain types
    const autoApproveTypes = ['holiday', 'training', 'conference']
    const isApproved = body.autoApprove || autoApproveTypes.includes(body.adjustmentType)

    const adjustment = await queryOne(`
      INSERT INTO capacity_adjustments (
        team_member_id,
        department_id,
        adjustment_type,
        start_date,
        end_date,
        hours_per_day,
        adjusted_hours_per_day,
        is_recurring,
        recurrence_pattern,
        title,
        description,
        is_approved,
        approved_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      body.teamMemberId || null,
      body.departmentId || null,
      body.adjustmentType,
      body.startDate,
      body.endDate,
      hoursPerDay,
      adjustedHoursPerDay,
      body.isRecurring || false,
      body.recurrencePattern || null,
      body.title || null,
      body.description || null,
      isApproved,
      isApproved ? user.id : null
    ])

    // Calculate hours impact
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const hoursImpact = totalDays * (hoursPerDay - adjustedHoursPerDay)

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
        createdAt: adjustment.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create capacity adjustment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create capacity adjustment'
    })
  }
})
