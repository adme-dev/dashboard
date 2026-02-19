/**
 * List Automation Rules
 * GET /api/agency/automation/rules
 *
 * Query params:
 * - triggerType: Filter by trigger type
 * - projectId: Filter by project
 * - clientId: Filter by client
 * - isActive: Filter by active status
 * - search: Search by name/description
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.triggerType) {
      conditions.push(`ar.trigger_type = $${idx++}`)
      params.push(query.triggerType)
    }

    if (query.projectId) {
      conditions.push(`ar.project_id = $${idx++}`)
      params.push(query.projectId)
    }

    if (query.clientId) {
      conditions.push(`ar.client_id = $${idx++}`)
      params.push(query.clientId)
    }

    if (query.isActive !== undefined) {
      conditions.push(`ar.is_active = $${idx++}`)
      params.push(query.isActive === 'true')
    }

    if (query.search) {
      conditions.push(`(ar.name ILIKE $${idx} OR ar.description ILIKE $${idx})`)
      params.push(`%${query.search}%`)
      idx++
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const rules = await queryRows(`
      SELECT
        ar.id,
        ar.name,
        ar.description,
        ar.is_active,
        ar.trigger_type,
        ar.trigger_config,
        ar.conditions,
        ar.actions,
        ar.project_id,
        p.name AS project_name,
        ar.client_id,
        c.name AS client_name,
        ar.run_once_per_entity,
        ar.cooldown_minutes,
        ar.max_executions_per_day,
        ar.stop_on_first_action_failure,
        ar.created_by,
        tm.name AS created_by_name,
        ar.created_at,
        ar.updated_at,
        (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id) AS total_executions,
        (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id AND ae.status = 'completed') AS successful_executions,
        (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id AND ae.status = 'failed') AS failed_executions,
        (SELECT MAX(triggered_at) FROM automation_executions ae WHERE ae.rule_id = ar.id) AS last_triggered_at
      FROM automation_rules ar
      LEFT JOIN projects p ON ar.project_id = p.id
      LEFT JOIN agency_clients c ON ar.client_id = c.id
      LEFT JOIN team_members tm ON ar.created_by = tm.id
      ${whereClause}
      ORDER BY ar.is_active DESC, ar.name
    `, params)

    // Group by trigger type for summary
    const byTrigger = new Map<string, number>()
    let activeCount = 0

    for (const rule of rules) {
      const count = byTrigger.get(rule.trigger_type) || 0
      byTrigger.set(rule.trigger_type, count + 1)
      if (rule.is_active) activeCount++
    }

    return {
      rules: rules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.is_active,
        trigger: {
          type: r.trigger_type,
          config: r.trigger_config
        },
        conditions: r.conditions,
        actions: r.actions,
        scope: {
          project: r.project_id ? { id: r.project_id, name: r.project_name } : null,
          client: r.client_id ? { id: r.client_id, name: r.client_name } : null
        },
        settings: {
          runOncePerEntity: r.run_once_per_entity,
          cooldownMinutes: r.cooldown_minutes,
          maxExecutionsPerDay: r.max_executions_per_day,
          stopOnFirstActionFailure: r.stop_on_first_action_failure
        },
        stats: {
          totalExecutions: Number(r.total_executions),
          successful: Number(r.successful_executions),
          failed: Number(r.failed_executions),
          lastTriggeredAt: r.last_triggered_at
        },
        createdBy: r.created_by ? {
          id: r.created_by,
          name: r.created_by_name
        } : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })),
      summary: {
        total: rules.length,
        active: activeCount,
        inactive: rules.length - activeCount,
        byTriggerType: Object.fromEntries(byTrigger)
      }
    }
  } catch (error) {
    console.error('Failed to fetch automation rules:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch automation rules'
    })
  }
})
