/**
 * List board automations
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const automations = await queryRows(`
    SELECT ba.*, tm.name as created_by_name
    FROM board_automations ba
    LEFT JOIN team_members tm ON ba.created_by = tm.id
    WHERE ba.board_id = $1
    ORDER BY ba.created_at DESC
  `, [boardId])

  return {
    automations: automations.map(a => ({
      id: a.id,
      boardId: a.board_id,
      name: a.name,
      isActive: a.is_active,
      triggerType: a.trigger_type,
      triggerConfig: a.trigger_config,
      actionType: a.action_type,
      actionConfig: a.action_config,
      createdBy: a.created_by,
      createdByName: a.created_by_name,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }))
  }
})
