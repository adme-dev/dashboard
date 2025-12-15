/**
 * Get Budget Alerts
 * GET /api/agency/budget-alerts
 *
 * Query params:
 * - status: Filter by status (active, acknowledged, resolved, dismissed)
 * - severity: Filter by severity (info, warning, critical, danger)
 * - projectId: Filter by project
 * - clientId: Filter by client
 * - limit: Max results (default 50)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const severity = query.severity as string | undefined
  const projectId = query.projectId as string | undefined
  const clientId = query.clientId as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build query conditions
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (status && status !== 'all') {
      conditions.push(`ba.status = $${idx}`)
      params.push(status)
      idx++
    }

    if (severity && severity !== 'all') {
      conditions.push(`ba.severity = $${idx}`)
      params.push(severity)
      idx++
    }

    if (projectId) {
      conditions.push(`ba.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (clientId) {
      conditions.push(`ba.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit)

    const alerts = await queryRows(`
      SELECT
        ba.id,
        ba.alert_type,
        ba.severity,
        ba.title,
        ba.message,
        ba.current_value,
        ba.threshold_value,
        ba.budget_amount,
        ba.percent_consumed,
        ba.projected_total,
        ba.days_to_budget_exhaustion,
        ba.burn_rate_daily,
        ba.status,
        ba.acknowledged_at,
        ba.resolved_at,
        ba.resolution_notes,
        ba.created_at,
        ba.project_id,
        p.name as project_name,
        ba.client_id,
        c.name as client_name,
        ack.name as acknowledged_by_name
      FROM budget_alerts ba
      LEFT JOIN projects p ON ba.project_id = p.id
      LEFT JOIN agency_clients c ON ba.client_id = c.id
      LEFT JOIN team_members ack ON ba.acknowledged_by = ack.id
      ${whereClause}
      ORDER BY
        CASE ba.severity
          WHEN 'danger' THEN 1
          WHEN 'critical' THEN 2
          WHEN 'warning' THEN 3
          ELSE 4
        END,
        ba.created_at DESC
      LIMIT $${idx}
    `, params)

    // Get summary counts
    const summary = await queryOne(`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'active' AND severity = 'danger' THEN 1 END) as danger_count,
        COUNT(CASE WHEN status = 'active' AND severity = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN status = 'active' AND severity = 'warning' THEN 1 END) as warning_count,
        COUNT(CASE WHEN status = 'acknowledged' THEN 1 END) as acknowledged_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count
      FROM budget_alerts
    `)

    return {
      alerts: alerts.map(a => ({
        id: a.id,
        alertType: a.alert_type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        currentValue: Number(a.current_value || 0),
        thresholdValue: Number(a.threshold_value || 0),
        budgetAmount: Number(a.budget_amount || 0),
        percentConsumed: Number(a.percent_consumed || 0),
        projectedTotal: a.projected_total ? Number(a.projected_total) : null,
        daysToExhaustion: a.days_to_budget_exhaustion,
        burnRateDaily: a.burn_rate_daily ? Number(a.burn_rate_daily) : null,
        status: a.status,
        acknowledgedAt: a.acknowledged_at,
        acknowledgedByName: a.acknowledged_by_name,
        resolvedAt: a.resolved_at,
        resolutionNotes: a.resolution_notes,
        createdAt: a.created_at,
        projectId: a.project_id,
        projectName: a.project_name,
        clientId: a.client_id,
        clientName: a.client_name
      })),
      summary: {
        activeCount: Number(summary.active_count || 0),
        dangerCount: Number(summary.danger_count || 0),
        criticalCount: Number(summary.critical_count || 0),
        warningCount: Number(summary.warning_count || 0),
        acknowledgedCount: Number(summary.acknowledged_count || 0),
        resolvedCount: Number(summary.resolved_count || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch budget alerts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch budget alerts'
    })
  }
})
