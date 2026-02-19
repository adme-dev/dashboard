/**
 * Manually Execute Automation Rule
 * POST /api/agency/automation/rules/:id/execute
 *
 * Manually trigger a rule execution for testing or one-off runs
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ExecuteBody {
  entityType: string
  entityId: string
  skipConditions?: boolean
  dryRun?: boolean
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'id')

  if (!ruleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rule ID is required'
    })
  }

  const body = await readBody<ExecuteBody>(event)

  if (!body.entityType || !body.entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entity type and entity ID are required'
    })
  }

  try {
    // Get the rule
    const rule = await queryOne(`
      SELECT * FROM automation_rules WHERE id = $1
    `, [ruleId])

    if (!rule) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automation rule not found'
      })
    }

    // Check cooldown (unless skipping)
    if (!body.skipConditions) {
      const canExecute = await queryOne(`
        SELECT check_automation_cooldown($1, $2, $3) AS can_execute
      `, [ruleId, body.entityType, body.entityId])

      if (!canExecute?.can_execute) {
        return {
          success: false,
          skipped: true,
          reason: 'Rule is in cooldown period or has reached execution limits'
        }
      }
    }

    // If dry run, just return what would happen
    if (body.dryRun) {
      return {
        success: true,
        dryRun: true,
        rule: {
          id: rule.id,
          name: rule.name,
          triggerType: rule.trigger_type
        },
        wouldExecute: {
          conditions: rule.conditions,
          actions: rule.actions
        },
        entity: {
          type: body.entityType,
          id: body.entityId
        }
      }
    }

    // Create execution record
    const execution = await queryOne(`
      INSERT INTO automation_executions (
        rule_id,
        trigger_type,
        entity_type,
        entity_id,
        status,
        started_at
      ) VALUES ($1, 'manual', $2, $3, 'running', NOW())
      RETURNING *
    `, [ruleId, body.entityType, body.entityId])

    // Record cooldown
    await queryOne(`SELECT record_automation_cooldown($1, $2, $3)`, [
      ruleId, body.entityType, body.entityId
    ])

    // In a real implementation, this would:
    // 1. Evaluate conditions against the entity
    // 2. Execute each action in sequence
    // 3. Update the execution record with results
    // For now, we simulate successful execution

    const actionsExecuted = (rule.actions as any[]).map((action: any, index: number) => ({
      action_index: index,
      type: action.type,
      status: 'success',
      result: { simulated: true }
    }))

    // Update execution as completed
    const completedExecution = await queryOne(`
      UPDATE automation_executions
      SET
        status = 'completed',
        completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM NOW() - started_at)::INTEGER,
        conditions_met = true,
        actions_executed = $1
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(actionsExecuted), execution.id])

    return {
      success: true,
      execution: {
        id: completedExecution.id,
        ruleId: completedExecution.rule_id,
        status: completedExecution.status,
        entityType: completedExecution.entity_type,
        entityId: completedExecution.entity_id,
        conditionsMet: completedExecution.conditions_met,
        actionsExecuted: completedExecution.actions_executed,
        triggeredAt: completedExecution.triggered_at,
        completedAt: completedExecution.completed_at,
        durationMs: completedExecution.duration_ms
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to execute automation rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to execute automation rule'
    })
  }
})
