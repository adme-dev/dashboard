/**
 * Update Budget Alert
 * PUT /api/agency/budget-alerts/:id
 *
 * Updates an existing budget alert
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface UpdateAlertBody {
  severity?: 'info' | 'warning' | 'critical' | 'danger'
  title?: string
  message?: string
  currentValue?: number
  thresholdValue?: number
  budgetAmount?: number
  percentConsumed?: number
  projectedTotal?: number
  daysToExhaustion?: number
  burnRateDaily?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins and owners can update alerts
  await requireRole(event, ['owner', 'admin'])

  const alertId = getRouterParam(event, 'id')
  const body = await readBody<UpdateAlertBody>(event)

  if (!alertId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert ID is required'
    })
  }

  // Build dynamic update
  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.severity !== undefined) {
    if (!['info', 'warning', 'critical', 'danger'].includes(body.severity)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid severity level'
      })
    }
    fields.push(`severity = $${idx}`)
    values.push(body.severity)
    idx++
  }

  if (body.title !== undefined) {
    if (!body.title.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Title cannot be empty'
      })
    }
    fields.push(`title = $${idx}`)
    values.push(body.title.trim())
    idx++
  }

  if (body.message !== undefined) {
    fields.push(`message = $${idx}`)
    values.push(body.message?.trim() || null)
    idx++
  }

  if (body.currentValue !== undefined) {
    fields.push(`current_value = $${idx}`)
    values.push(body.currentValue)
    idx++
  }

  if (body.thresholdValue !== undefined) {
    fields.push(`threshold_value = $${idx}`)
    values.push(body.thresholdValue)
    idx++
  }

  if (body.budgetAmount !== undefined) {
    fields.push(`budget_amount = $${idx}`)
    values.push(body.budgetAmount)
    idx++
  }

  if (body.percentConsumed !== undefined) {
    fields.push(`percent_consumed = $${idx}`)
    values.push(body.percentConsumed)
    idx++
  }

  if (body.projectedTotal !== undefined) {
    fields.push(`projected_total = $${idx}`)
    values.push(body.projectedTotal)
    idx++
  }

  if (body.daysToExhaustion !== undefined) {
    fields.push(`days_to_budget_exhaustion = $${idx}`)
    values.push(body.daysToExhaustion)
    idx++
  }

  if (body.burnRateDaily !== undefined) {
    fields.push(`burn_rate_daily = $${idx}`)
    values.push(body.burnRateDaily)
    idx++
  }

  if (fields.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No fields to update'
    })
  }

  values.push(alertId)

  try {
    const alert = await queryOne(`
      UPDATE budget_alerts
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, values)

    if (!alert) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Budget alert not found'
      })
    }

    return {
      success: true,
      alert: {
        id: alert.id,
        alertType: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        projectId: alert.project_id,
        clientId: alert.client_id,
        currentValue: alert.current_value ? Number(alert.current_value) : null,
        thresholdValue: alert.threshold_value ? Number(alert.threshold_value) : null,
        budgetAmount: alert.budget_amount ? Number(alert.budget_amount) : null,
        percentConsumed: alert.percent_consumed ? Number(alert.percent_consumed) : null,
        projectedTotal: alert.projected_total ? Number(alert.projected_total) : null,
        daysToExhaustion: alert.days_to_budget_exhaustion,
        burnRateDaily: alert.burn_rate_daily ? Number(alert.burn_rate_daily) : null,
        status: alert.status,
        updatedAt: alert.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update budget alert:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update budget alert'
    })
  }
})
