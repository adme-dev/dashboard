/**
 * Update Automation Rule
 * PUT /api/agency/automation/rules/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateRuleBody {
  name?: string
  description?: string
  isActive?: boolean
  triggerType?: string
  triggerConfig?: Record<string, any>
  conditions?: Array<{ field: string; operator: string; value: any }>
  actions?: Array<{ type: string; config: Record<string, any> }>
  projectId?: string | null
  clientId?: string | null
  runOncePerEntity?: boolean
  cooldownMinutes?: number
  maxExecutionsPerDay?: number | null
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
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'id')

  if (!ruleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rule ID is required'
    })
  }

  const body = await readBody<UpdateRuleBody>(event)

  try {
    // Check rule exists
    const existing = await queryOne(`
      SELECT id, trigger_type FROM automation_rules WHERE id = $1
    `, [ruleId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automation rule not found'
      })
    }

    // Validate trigger type if provided
    if (body.triggerType && !VALID_TRIGGER_TYPES.includes(body.triggerType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`
      })
    }

    // Validate actions if provided
    if (body.actions) {
      if (body.actions.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'At least one action is required'
        })
      }
      for (let i = 0; i < body.actions.length; i++) {
        const action = body.actions[i]!
        if (!action.type || !VALID_ACTION_TYPES.includes(action.type)) {
          throw createError({
            statusCode: 400,
            statusMessage: `Invalid action type at index ${i}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}`
          })
        }
      }
    }

    // Build update
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      updates.push(`name = $${idx++}`)
      params.push(body.name.trim())
    }

    if (body.description !== undefined) {
      updates.push(`description = $${idx++}`)
      params.push(body.description)
    }

    if (body.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`)
      params.push(body.isActive)
    }

    if (body.triggerType !== undefined) {
      updates.push(`trigger_type = $${idx++}`)
      params.push(body.triggerType)
    }

    if (body.triggerConfig !== undefined) {
      updates.push(`trigger_config = $${idx++}`)
      params.push(JSON.stringify(body.triggerConfig))
    }

    if (body.conditions !== undefined) {
      updates.push(`conditions = $${idx++}`)
      params.push(JSON.stringify(body.conditions))
    }

    if (body.actions !== undefined) {
      updates.push(`actions = $${idx++}`)
      params.push(JSON.stringify(body.actions))
    }

    if (body.projectId !== undefined) {
      updates.push(`project_id = $${idx++}`)
      params.push(body.projectId)
    }

    if (body.clientId !== undefined) {
      updates.push(`client_id = $${idx++}`)
      params.push(body.clientId)
    }

    if (body.runOncePerEntity !== undefined) {
      updates.push(`run_once_per_entity = $${idx++}`)
      params.push(body.runOncePerEntity)
    }

    if (body.cooldownMinutes !== undefined) {
      updates.push(`cooldown_minutes = $${idx++}`)
      params.push(body.cooldownMinutes)
    }

    if (body.maxExecutionsPerDay !== undefined) {
      updates.push(`max_executions_per_day = $${idx++}`)
      params.push(body.maxExecutionsPerDay)
    }

    if (body.stopOnFirstActionFailure !== undefined) {
      updates.push(`stop_on_first_action_failure = $${idx++}`)
      params.push(body.stopOnFirstActionFailure)
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided'
      }
    }

    updates.push('updated_at = NOW()')
    params.push(ruleId)

    const rule = await queryOne(`
      UPDATE automation_rules
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Update scheduled job if trigger type changed
    const newTriggerType = body.triggerType || existing.trigger_type
    if (newTriggerType === 'schedule') {
      const cronExpression = body.triggerConfig?.cron
      const timezone = body.triggerConfig?.timezone || 'UTC'

      if (cronExpression) {
        await queryOne(`
          INSERT INTO scheduled_jobs (rule_id, cron_expression, timezone, is_active)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (rule_id) DO UPDATE SET
            cron_expression = EXCLUDED.cron_expression,
            timezone = EXCLUDED.timezone,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `, [ruleId, cronExpression, timezone, body.isActive ?? rule.is_active])
      }
    } else if (existing.trigger_type === 'schedule' && newTriggerType !== 'schedule') {
      // Remove scheduled job if trigger type changed from schedule
      await queryOne(`DELETE FROM scheduled_jobs WHERE rule_id = $1`, [ruleId])
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
        updatedAt: rule.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update automation rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update automation rule'
    })
  }
})
