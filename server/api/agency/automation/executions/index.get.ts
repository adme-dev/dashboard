/**
 * List Automation Executions
 * GET /api/agency/automation/executions
 *
 * Query params:
 * - ruleId: Filter by rule
 * - status: Filter by status
 * - entityType: Filter by entity type
 * - entityId: Filter by entity ID
 * - startDate: Filter by date range start
 * - endDate: Filter by date range end
 * - limit: Number of results (default 50, max 200)
 * - offset: Pagination offset
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const limit = Math.min(Number(query.limit) || 50, 200)
  const offset = Number(query.offset) || 0

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.ruleId) {
      conditions.push(`ae.rule_id = $${idx++}`)
      params.push(query.ruleId)
    }

    if (query.status) {
      conditions.push(`ae.status = $${idx++}`)
      params.push(query.status)
    }

    if (query.entityType) {
      conditions.push(`ae.entity_type = $${idx++}`)
      params.push(query.entityType)
    }

    if (query.entityId) {
      conditions.push(`ae.entity_id = $${idx++}`)
      params.push(query.entityId)
    }

    if (query.startDate) {
      conditions.push(`ae.triggered_at >= $${idx++}`)
      params.push(query.startDate)
    }

    if (query.endDate) {
      conditions.push(`ae.triggered_at <= $${idx++}`)
      params.push(query.endDate)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) AS total
      FROM automation_executions ae
      ${whereClause}
    `, params)

    // Get executions
    const executions = await queryRows(`
      SELECT
        ae.id,
        ae.rule_id,
        ar.name AS rule_name,
        ar.trigger_type,
        ae.entity_type,
        ae.entity_id,
        ae.status,
        ae.conditions_met,
        ae.conditions_result,
        ae.actions_executed,
        ae.triggered_at,
        ae.started_at,
        ae.completed_at,
        ae.duration_ms,
        ae.error_message,
        ae.error_details
      FROM automation_executions ae
      JOIN automation_rules ar ON ae.rule_id = ar.id
      ${whereClause}
      ORDER BY ae.triggered_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, [...params, limit, offset])

    // Get summary stats
    const stats = await queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
        COUNT(*) FILTER (WHERE status = 'running') AS running,
        ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms
      FROM automation_executions ae
      ${whereClause}
    `, params)

    return {
      executions: executions.map(e => ({
        id: e.id,
        rule: {
          id: e.rule_id,
          name: e.rule_name,
          triggerType: e.trigger_type
        },
        entity: {
          type: e.entity_type,
          id: e.entity_id
        },
        status: e.status,
        conditionsMet: e.conditions_met,
        conditionsResult: e.conditions_result,
        actionsExecuted: e.actions_executed,
        triggeredAt: e.triggered_at,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        durationMs: e.duration_ms,
        error: e.error_message ? {
          message: e.error_message,
          details: e.error_details
        } : null
      })),
      pagination: {
        total: Number(countResult?.total || 0),
        limit,
        offset,
        hasMore: offset + executions.length < Number(countResult?.total || 0)
      },
      stats: {
        total: Number(stats?.total || 0),
        completed: Number(stats?.completed || 0),
        failed: Number(stats?.failed || 0),
        skipped: Number(stats?.skipped || 0),
        running: Number(stats?.running || 0),
        avgDurationMs: Number(stats?.avg_duration_ms || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch automation executions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch automation executions'
    })
  }
})
