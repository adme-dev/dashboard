/**
 * Get All Projects Health Summary
 * GET /api/agency/health/projects
 *
 * Query params:
 * - status: Filter by health status (healthy, warning, critical)
 * - clientId: Filter by client
 * - managerId: Filter by project manager
 * - trend: Filter by trend (improving, stable, declining)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const conditions: string[] = ['p.status IN (\'active\', \'on_hold\')']
  const params: any[] = []
  let idx = 1

  if (query.status) {
    conditions.push(`phs.overall_status = $${idx++}`)
    params.push(query.status)
  }

  if (query.clientId) {
    conditions.push(`p.client_id = $${idx++}`)
    params.push(query.clientId)
  }

  if (query.managerId) {
    conditions.push(`p.project_manager_id = $${idx++}`)
    params.push(query.managerId)
  }

  if (query.trend) {
    conditions.push(`phs.trend = $${idx++}`)
    params.push(query.trend)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    // Get projects with latest health snapshots
    const projects = await queryRows(`
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
        COALESCE(phs.overall_score, 0) AS overall_score,
        COALESCE(phs.overall_status, 'unknown') AS overall_status,
        phs.schedule_score,
        phs.budget_score,
        phs.scope_score,
        phs.team_score,
        phs.quality_score,
        phs.trend,
        phs.previous_score,
        phs.snapshot_date,
        phs.calculated_at,
        COALESCE(alerts.active_count, 0) AS active_alerts,
        COALESCE(alerts.critical_count, 0) AS critical_alerts
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
      ${whereClause}
      ORDER BY p.id, phs.snapshot_date DESC NULLS LAST
    `, params)

    // Get portfolio summary
    const summary = await queryOne(`
      SELECT
        COUNT(*) AS total_projects,
        COUNT(*) FILTER (WHERE phs.overall_status = 'healthy') AS healthy_count,
        COUNT(*) FILTER (WHERE phs.overall_status = 'warning') AS warning_count,
        COUNT(*) FILTER (WHERE phs.overall_status = 'critical') AS critical_count,
        COUNT(*) FILTER (WHERE phs.overall_status IS NULL OR phs.overall_status = 'unknown') AS unknown_count,
        ROUND(AVG(phs.overall_score)::numeric, 1) AS avg_health_score,
        COUNT(*) FILTER (WHERE phs.trend = 'improving') AS improving_count,
        COUNT(*) FILTER (WHERE phs.trend = 'stable') AS stable_count,
        COUNT(*) FILTER (WHERE phs.trend = 'declining') AS declining_count
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT *
        FROM project_health_snapshots
        WHERE project_id = p.id
        ORDER BY snapshot_date DESC
        LIMIT 1
      ) phs ON true
      WHERE p.status IN ('active', 'on_hold')
    `, [])

    return {
      projects: projects.map(p => ({
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
          snapshotDate: p.snapshot_date,
          calculatedAt: p.calculated_at
        },
        alerts: {
          active: Number(p.active_alerts),
          critical: Number(p.critical_alerts)
        }
      })),
      summary: {
        totalProjects: Number(summary?.total_projects || 0),
        byStatus: {
          healthy: Number(summary?.healthy_count || 0),
          warning: Number(summary?.warning_count || 0),
          critical: Number(summary?.critical_count || 0),
          unknown: Number(summary?.unknown_count || 0)
        },
        averageScore: Number(summary?.avg_health_score || 0),
        byTrend: {
          improving: Number(summary?.improving_count || 0),
          stable: Number(summary?.stable_count || 0),
          declining: Number(summary?.declining_count || 0)
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch projects health:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch projects health'
    })
  }
})
