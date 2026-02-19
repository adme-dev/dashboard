/**
 * Get Automation Rule Details
 * GET /api/agency/automation/rules/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'id')

  if (!ruleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rule ID is required'
    })
  }

  try {
    const rule = await queryOne(`
      SELECT
        ar.*,
        p.name AS project_name,
        c.name AS client_name,
        tm.name AS created_by_name
      FROM automation_rules ar
      LEFT JOIN projects p ON ar.project_id = p.id
      LEFT JOIN agency_clients c ON ar.client_id = c.id
      LEFT JOIN team_members tm ON ar.created_by = tm.id
      WHERE ar.id = $1
    `, [ruleId])

    if (!rule) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automation rule not found'
      })
    }

    // Get execution stats
    const stats = await queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS successful,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
        ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
        MAX(triggered_at) AS last_triggered,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '24 hours') AS executions_24h,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '7 days') AS executions_7d
      FROM automation_executions
      WHERE rule_id = $1
    `, [ruleId])

    // Get recent executions
    const recentExecutions = await queryRows(`
      SELECT
        id,
        entity_type,
        entity_id,
        status,
        conditions_met,
        triggered_at,
        started_at,
        completed_at,
        duration_ms,
        error_message,
        jsonb_array_length(actions_executed) AS actions_count
      FROM automation_executions
      WHERE rule_id = $1
      ORDER BY triggered_at DESC
      LIMIT 10
    `, [ruleId])

    // Get scheduled job info if applicable
    let scheduledJob = null
    if (rule.trigger_type === 'schedule') {
      scheduledJob = await queryOne(`
        SELECT
          cron_expression,
          timezone,
          is_active,
          next_run_at,
          last_run_at,
          last_run_status
        FROM scheduled_jobs
        WHERE rule_id = $1
      `, [ruleId])
    }

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        isActive: rule.is_active,
        trigger: {
          type: rule.trigger_type,
          config: rule.trigger_config
        },
        conditions: rule.conditions,
        actions: rule.actions,
        scope: {
          project: rule.project_id ? { id: rule.project_id, name: rule.project_name } : null,
          client: rule.client_id ? { id: rule.client_id, name: rule.client_name } : null
        },
        settings: {
          runOncePerEntity: rule.run_once_per_entity,
          cooldownMinutes: rule.cooldown_minutes,
          maxExecutionsPerDay: rule.max_executions_per_day,
          stopOnFirstActionFailure: rule.stop_on_first_action_failure
        },
        createdBy: rule.created_by ? {
          id: rule.created_by,
          name: rule.created_by_name
        } : null,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      },
      stats: {
        totalExecutions: Number(stats?.total || 0),
        successful: Number(stats?.successful || 0),
        failed: Number(stats?.failed || 0),
        skipped: Number(stats?.skipped || 0),
        avgDurationMs: Number(stats?.avg_duration_ms || 0),
        lastTriggered: stats?.last_triggered,
        executions24h: Number(stats?.executions_24h || 0),
        executions7d: Number(stats?.executions_7d || 0)
      },
      recentExecutions: recentExecutions.map(e => ({
        id: e.id,
        entityType: e.entity_type,
        entityId: e.entity_id,
        status: e.status,
        conditionsMet: e.conditions_met,
        triggeredAt: e.triggered_at,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        durationMs: e.duration_ms,
        errorMessage: e.error_message,
        actionsCount: e.actions_count
      })),
      scheduledJob: scheduledJob ? {
        cronExpression: scheduledJob.cron_expression,
        timezone: scheduledJob.timezone,
        isActive: scheduledJob.is_active,
        nextRunAt: scheduledJob.next_run_at,
        lastRunAt: scheduledJob.last_run_at,
        lastRunStatus: scheduledJob.last_run_status
      } : null
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch automation rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch automation rule'
    })
  }
})
