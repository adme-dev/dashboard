/**
 * Create Automation Rule
 * POST /api/agency/automation/rules
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface Condition {
  field: string
  operator: string
  value: any
}

interface Action {
  type: string
  config: Record<string, any>
}

interface CreateRuleBody {
  name: string
  description?: string
  isActive?: boolean
  triggerType: string
  triggerConfig?: Record<string, any>
  conditions?: Condition[]
  actions: Action[]
  projectId?: string
  clientId?: string
  runOncePerEntity?: boolean
  cooldownMinutes?: number
  maxExecutionsPerDay?: number
  stopOnFirstActionFailure?: boolean
}

const VALID_TRIGGER_TYPES = [
  'task_created', 'task_updated', 'task_status_changed', 'task_assigned', 'task_due_soon', 'task_overdue',
  'project_created', 'project_updated', 'project_status_changed', 'project_budget_threshold',
  'time_entry_created', 'time_entry_approved',
  'invoice_created', 'invoice_sent', 'invoice_overdue', 'invoice_paid',
  'client_created', 'client_updated',
  'intake_submitted', 'intake_approved',
  'schedule', 'manual'
]

const VALID_ACTION_TYPES = [
  'update_field', 'assign_to', 'send_notification', 'create_task', 'create_subtask',
  'send_email', 'add_tag', 'remove_tag', 'move_to_status', 'set_due_date',
  'add_comment', 'webhook', 'slack_message', 'delay'
]

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateRuleBody>(event)

  // Validation
  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rule name is required'
    })
  }

  if (!body.triggerType || !VALID_TRIGGER_TYPES.includes(body.triggerType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`
    })
  }

  if (!body.actions || body.actions.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one action is required'
    })
  }

  // Validate actions
  for (let i = 0; i < body.actions.length; i++) {
    const action = body.actions[i]!
    if (!action.type || !VALID_ACTION_TYPES.includes(action.type)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid action type at index ${i}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}`
      })
    }
  }

  try {
    const rule = await queryOne(`
      INSERT INTO automation_rules (
        name,
        description,
        is_active,
        trigger_type,
        trigger_config,
        conditions,
        actions,
        project_id,
        client_id,
        run_once_per_entity,
        cooldown_minutes,
        max_executions_per_day,
        stop_on_first_action_failure,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      body.name.trim(),
      body.description || null,
      body.isActive ?? true,
      body.triggerType,
      JSON.stringify(body.triggerConfig || {}),
      JSON.stringify(body.conditions || []),
      JSON.stringify(body.actions),
      body.projectId || null,
      body.clientId || null,
      body.runOncePerEntity ?? false,
      body.cooldownMinutes ?? 0,
      body.maxExecutionsPerDay || null,
      body.stopOnFirstActionFailure ?? true,
      user.id
    ])

    // If it's a scheduled rule, create the scheduled job entry
    if (body.triggerType === 'schedule' && body.triggerConfig?.cron) {
      await queryOne(`
        INSERT INTO scheduled_jobs (rule_id, cron_expression, timezone, is_active)
        VALUES ($1, $2, $3, $4)
      `, [
        rule.id,
        body.triggerConfig.cron,
        body.triggerConfig.timezone || 'UTC',
        body.isActive ?? true
      ])
    }

    return {
      success: true,
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
        projectId: rule.project_id,
        clientId: rule.client_id,
        settings: {
          runOncePerEntity: rule.run_once_per_entity,
          cooldownMinutes: rule.cooldown_minutes,
          maxExecutionsPerDay: rule.max_executions_per_day,
          stopOnFirstActionFailure: rule.stop_on_first_action_failure
        },
        createdAt: rule.created_at
      }
    }
  } catch (error) {
    console.error('Failed to create automation rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create automation rule'
    })
  }
})
