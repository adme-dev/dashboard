/**
 * Get Single Project Health Details
 * GET /api/agency/health/projects/:id
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Get project with latest health
    const project = await queryOne(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.status,
        p.budget_type,
        p.budget_amount,
        p.start_date,
        p.end_date,
        c.id AS client_id,
        c.name AS client_name,
        pm.id AS project_manager_id,
        pm.name AS project_manager_name
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      WHERE p.id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Get latest health snapshot
    const latestHealth = await queryOne(`
      SELECT *
      FROM project_health_snapshots
      WHERE project_id = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [projectId])

    // Get health trends (last 30 days)
    const trends = await queryRows(`
      SELECT
        snapshot_date,
        overall_score,
        overall_status,
        schedule_score,
        budget_score,
        scope_score,
        team_score,
        quality_score
      FROM project_health_snapshots
      WHERE project_id = $1
        AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY snapshot_date ASC
    `, [projectId])

    // Get active alerts
    const alerts = await queryRows(`
      SELECT
        id,
        alert_type,
        severity,
        title,
        message,
        factor_key,
        factor_score,
        is_active,
        acknowledged_by,
        acknowledged_at,
        created_at
      FROM health_alerts
      WHERE project_id = $1
        AND is_active = true
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 20
    `, [projectId])

    // Get health factors config
    const factors = await queryRows(`
      SELECT *
      FROM health_factor_config
      WHERE is_active = true
      ORDER BY sort_order
    `, [])

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        budgetType: project.budget_type,
        budgetAmount: project.budget_amount,
        startDate: project.start_date,
        endDate: project.end_date,
        client: project.client_id ? {
          id: project.client_id,
          name: project.client_name
        } : null,
        projectManager: project.project_manager_id ? {
          id: project.project_manager_id,
          name: project.project_manager_name
        } : null
      },
      health: latestHealth ? {
        overallScore: latestHealth.overall_score,
        overallStatus: latestHealth.overall_status,
        scores: {
          schedule: latestHealth.schedule_score,
          budget: latestHealth.budget_score,
          scope: latestHealth.scope_score,
          team: latestHealth.team_score,
          quality: latestHealth.quality_score
        },
        trend: latestHealth.trend,
        previousScore: latestHealth.previous_score,
        metrics: latestHealth.metrics,
        snapshotDate: latestHealth.snapshot_date,
        calculatedAt: latestHealth.calculated_at
      } : null,
      trends: trends.map(t => ({
        date: t.snapshot_date,
        overallScore: t.overall_score,
        overallStatus: t.overall_status,
        scheduleScore: t.schedule_score,
        budgetScore: t.budget_score,
        scopeScore: t.scope_score,
        teamScore: t.team_score,
        qualityScore: t.quality_score
      })),
      alerts: alerts.map(a => ({
        id: a.id,
        type: a.alert_type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        factorKey: a.factor_key,
        factorScore: a.factor_score,
        isActive: a.is_active,
        acknowledgedBy: a.acknowledged_by,
        acknowledgedAt: a.acknowledged_at,
        createdAt: a.created_at
      })),
      factors: factors.map(f => ({
        name: f.factor_name,
        key: f.factor_key,
        description: f.description,
        weight: f.weight,
        thresholds: {
          healthy: f.healthy_threshold,
          warning: f.warning_threshold
        },
        colors: {
          healthy: f.color_healthy,
          warning: f.color_warning,
          critical: f.color_critical
        },
        icon: f.icon
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch project health:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project health'
    })
  }
})
