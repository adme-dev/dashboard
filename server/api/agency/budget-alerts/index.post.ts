/**
 * Create Budget Alert
 * POST /api/agency/budget-alerts
 *
 * Creates a new budget alert for a project or client
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface CreateAlertBody {
  alertType: 'budget_threshold' | 'burn_rate' | 'projected_overrun' | 'time_exceeded' | 'expense_exceeded'
  severity: 'info' | 'warning' | 'critical' | 'danger'
  title: string
  message?: string
  projectId?: string
  clientId?: string
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

  // Only admins and owners can create alerts
  await requireRole(event, ['owner', 'admin'])

  const body = await readBody<CreateAlertBody>(event)

  if (!body.alertType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert type is required'
    })
  }

  if (!body.severity || !['info', 'warning', 'critical', 'danger'].includes(body.severity)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid severity is required (info, warning, critical, danger)'
    })
  }

  if (!body.title?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Alert title is required'
    })
  }

  if (!body.projectId && !body.clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Either project ID or client ID is required'
    })
  }

  try {
    // Verify project/client exists
    if (body.projectId) {
      const project = await queryOne(
        `SELECT id FROM projects WHERE id = $1`,
        [body.projectId]
      )
      if (!project) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Project not found'
        })
      }
    }

    if (body.clientId) {
      const client = await queryOne(
        `SELECT id FROM agency_clients WHERE id = $1`,
        [body.clientId]
      )
      if (!client) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Client not found'
        })
      }
    }

    const alert = await queryOne(`
      INSERT INTO budget_alerts (
        alert_type,
        severity,
        title,
        message,
        project_id,
        client_id,
        current_value,
        threshold_value,
        budget_amount,
        percent_consumed,
        projected_total,
        days_to_budget_exhaustion,
        burn_rate_daily,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
      RETURNING *
    `, [
      body.alertType,
      body.severity,
      body.title.trim(),
      body.message?.trim() || null,
      body.projectId || null,
      body.clientId || null,
      body.currentValue || null,
      body.thresholdValue || null,
      body.budgetAmount || null,
      body.percentConsumed || null,
      body.projectedTotal || null,
      body.daysToExhaustion || null,
      body.burnRateDaily || null
    ])

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
        createdAt: alert.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create budget alert:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create budget alert'
    })
  }
})
