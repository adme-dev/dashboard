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

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const autoId = getRouterParam(event, 'autoId')
  const body = await readBody<UpdateAutomationBody>(event)

  if (!boardId || !autoId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and Automation ID are required' })
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
})
