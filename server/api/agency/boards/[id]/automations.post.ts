/**
 * Create a board automation
 */
import { queryOne } from '~~/server/utils/db'

interface CreateAutomationBody {
  name: string
  triggerType: string
  triggerConfig?: Record<string, any>
  actionType: string
  actionConfig?: Record<string, any>
}

const VALID_TRIGGERS = ['status_changed', 'date_arrived', 'item_created', 'column_changed']
const VALID_ACTIONS = ['send_email', 'create_notification', 'update_column']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const body = await readBody<CreateAutomationBody>(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Automation name is required' })
  }

  if (!VALID_TRIGGERS.includes(body.triggerType)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid trigger type. Must be one of: ${VALID_TRIGGERS.join(', ')}` })
  }

  if (!VALID_ACTIONS.includes(body.actionType)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid action type. Must be one of: ${VALID_ACTIONS.join(', ')}` })
  }

  const automation = await queryOne(`
    INSERT INTO board_automations (board_id, name, trigger_type, trigger_config, action_type, action_config, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    boardId,
    body.name.trim(),
    body.triggerType,
    JSON.stringify(body.triggerConfig || {}),
    body.actionType,
    JSON.stringify(body.actionConfig || {}),
    user.id,
  ])

  return {
    id: automation.id,
    boardId: automation.board_id,
    name: automation.name,
    isActive: automation.is_active,
    triggerType: automation.trigger_type,
    triggerConfig: automation.trigger_config,
    actionType: automation.action_type,
    actionConfig: automation.action_config,
    createdBy: automation.created_by,
    createdAt: automation.created_at,
  }
})
