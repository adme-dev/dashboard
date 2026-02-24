/**
 * Update a board automation
 */
import { queryOne } from '~~/server/utils/db'

interface UpdateAutomationBody {
  name?: string
  isActive?: boolean
  triggerType?: string
  triggerConfig?: Record<string, any>
  actionType?: string
  actionConfig?: Record<string, any>
}

const VALID_TRIGGERS = ['status_changed', 'date_arrived', 'item_created', 'column_changed']
const VALID_ACTIONS = ['send_email', 'create_notification', 'update_column']

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const autoId = getRouterParam(event, 'autoId')

  if (!boardId || !autoId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and Automation ID are required' })
  }

  await requireBoardAccess(event, boardId)
  const body = await readBody<UpdateAutomationBody>(event)

  if (body.triggerType !== undefined && !VALID_TRIGGERS.includes(body.triggerType)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid trigger type. Must be one of: ${VALID_TRIGGERS.join(', ')}` })
  }

  if (body.actionType !== undefined && !VALID_ACTIONS.includes(body.actionType)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid action type. Must be one of: ${VALID_ACTIONS.join(', ')}` })
  }

  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.name !== undefined) {
    fields.push(`name = $${idx}`)
    values.push(body.name.trim())
    idx++
  }
  if (body.isActive !== undefined) {
    fields.push(`is_active = $${idx}`)
    values.push(body.isActive)
    idx++
  }
  if (body.triggerType !== undefined) {
    fields.push(`trigger_type = $${idx}`)
    values.push(body.triggerType)
    idx++
  }
  if (body.triggerConfig !== undefined) {
    fields.push(`trigger_config = $${idx}`)
    values.push(JSON.stringify(body.triggerConfig))
    idx++
  }
  if (body.actionType !== undefined) {
    fields.push(`action_type = $${idx}`)
    values.push(body.actionType)
    idx++
  }
  if (body.actionConfig !== undefined) {
    fields.push(`action_config = $${idx}`)
    values.push(JSON.stringify(body.actionConfig))
    idx++
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  fields.push('updated_at = NOW()')
  values.push(autoId, boardId)

  try {
    const automation = await queryOne(`
      UPDATE board_automations
      SET ${fields.join(', ')}
      WHERE id = $${idx} AND board_id = $${idx + 1}
      RETURNING *
    `, values)

    if (!automation) {
      throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
    }

    return {
      id: automation.id,
      boardId: automation.board_id,
      name: automation.name,
      isActive: automation.is_active,
      triggerType: automation.trigger_type,
      triggerConfig: automation.trigger_config,
      actionType: automation.action_type,
      actionConfig: automation.action_config,
      updatedAt: automation.updated_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    if (error.message?.includes('does not exist')) {
      throw createError({ statusCode: 503, statusMessage: 'Automations are not yet available. Please run database migrations.' })
    }
    throw error
  }
})
