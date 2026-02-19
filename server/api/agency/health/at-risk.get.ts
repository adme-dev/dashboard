/**
 * Get At-Risk Projects
 * GET /api/agency/health/at-risk
 *
 * Returns projects that need attention: critical, warning with declining trend, or have critical alerts
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  try {
    const atRiskProjects = await queryRows(`
      SELECT DISTINCT ON (p.id)
        p.id AS project_id,
        p.name AS project_name,
        p.status AS project_status,
        p.budget_amount,
        p.start_date,
        p.end_date,
        c.id AS client_id,
        c.name AS client_name,
        pm.id AS project_manager_id,
        pm.name AS project_manager_name,
        phs.overall_score,
        phs.overall_status,
        phs.schedule_score,
        phs.budget_score,
        phs.scope_score,
        phs.team_score,
        phs.quality_score,
        phs.trend,
        phs.previous_score,
        phs.metrics,
        phs.snapshot_date,
        COALESCE(alerts.active_count, 0) AS active_alerts,
        COALESCE(alerts.critical_count, 0) AS critical_alerts,
        -- Calculate risk priority
        CASE
          WHEN phs.overall_status = 'critical' THEN 1
          WHEN phs.overall_status = 'warning' AND phs.trend = 'declining' THEN 2
          WHEN phs.overall_status = 'warning' THEN 3
          WHEN phs.trend = 'declining' THEN 4
          ELSE 5
        END AS risk_priority,
        -- Risk reasons
        ARRAY_REMOVE(ARRAY[
          CASE WHEN phs.overall_status = 'critical' THEN 'Critical health status' END,
          CASE WHEN phs.trend = 'declining' THEN 'Health declining' END,
          CASE WHEN phs.schedule_score < 40 THEN 'Schedule at risk' END,
          CASE WHEN phs.budget_score < 40 THEN 'Budget at risk' END,
          CASE WHEN alerts.critical_count > 0 THEN 'Has critical alerts' END
        ], NULL) AS risk_reasons
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM project_health_snapshots
        WHERE project_id = p.id
        ORDER BY snapshot_date DESC
        LIMIT 1
      ) phs ON true
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*) FILTER (WHERE is_active) AS active_count,
          COUNT(*) FILTER (WHERE is_active AND severity = 'critical') AS critical_count
        FROM health_alerts
        GROUP BY project_id
      ) alerts ON p.id = alerts.project_id
      WHERE p.status IN ('active', 'on_hold')
        AND (
          phs.overall_status IN ('warning', 'critical')
          OR phs.trend = 'declining'
          OR alerts.critical_count > 0
        )
      ORDER BY p.id, phs.snapshot_date DESC
    `, [])

    // Sort by risk priority
    atRiskProjects.sort((a, b) => a.risk_priority - b.risk_priority)

    // Get summary
    const criticalCount = atRiskProjects.filter(p => p.overall_status === 'critical').length
    const warningCount = atRiskProjects.filter(p => p.overall_status === 'warning').length
    const decliningCount = atRiskProjects.filter(p => p.trend === 'declining').length

    return {
      projects: atRiskProjects.map(p => ({
        id: p.project_id,
        name: p.project_name,
        status: p.project_status,
        client: p.client_id ? {
          id: p.client_id,
          name: p.client_name
        } : null,
        projectManager: p.project_manager_id ? {
          id: p.project_manager_id,
          name: p.project_manager_name
        } : null,
        budget: p.budget_amount,
        startDate: p.start_date,
        endDate: p.end_date,
        health: {
          overallScore: p.overall_score,
          overallStatus: p.overall_status,
          scheduleScore: p.schedule_score,
          budgetScore: p.budget_score,
          scopeScore: p.scope_score,
          teamScore: p.team_score,
          qualityScore: p.quality_score,
          trend: p.trend,
          previousScore: p.previous_score,
          snapshotDate: p.snapshot_date
        },
        alerts: {
          active: Number(p.active_alerts),
          critical: Number(p.critical_alerts)
        },
        riskPriority: p.risk_priority,
        riskReasons: p.risk_reasons || []
      })),
      summary: {
        totalAtRisk: atRiskProjects.length,
        critical: criticalCount,
        warning: warningCount,
        declining: decliningCount
      }
    }
  } catch (error) {
    console.error('Failed to fetch at-risk projects:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch at-risk projects'
    })
  }
})
