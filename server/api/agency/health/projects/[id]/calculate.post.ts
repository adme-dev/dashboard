/**
 * Calculate/Refresh Project Health
 * POST /api/agency/health/projects/:id/calculate
 *
 * Manually triggers health calculation for a project
 */

import { queryOne } from '~~/server/utils/db'
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
    // Verify project exists
    const project = await queryOne(`
      SELECT id, name FROM projects WHERE id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Calculate and create snapshot
    const snapshotId = await queryOne(`
      SELECT create_health_snapshot($1) AS snapshot_id
    `, [projectId])

    if (!snapshotId?.snapshot_id) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create health snapshot'
      })
    }

    // Get the created snapshot
    const snapshot = await queryOne(`
      SELECT *
      FROM project_health_snapshots
      WHERE id = $1
    `, [snapshotId.snapshot_id])

    return {
      success: true,
      snapshot: {
        id: snapshot.id,
        projectId: snapshot.project_id,
        snapshotDate: snapshot.snapshot_date,
        overallScore: snapshot.overall_score,
        overallStatus: snapshot.overall_status,
        scores: {
          schedule: snapshot.schedule_score,
          budget: snapshot.budget_score,
          scope: snapshot.scope_score,
          team: snapshot.team_score,
          quality: snapshot.quality_score
        },
        trend: snapshot.trend,
        previousScore: snapshot.previous_score,
        metrics: snapshot.metrics,
        calculatedAt: snapshot.calculated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to calculate project health:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to calculate project health'
    })
  }
})
