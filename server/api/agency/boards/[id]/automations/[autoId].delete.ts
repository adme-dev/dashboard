/**
 * Delete a board automation
 */
import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const autoId = getRouterParam(event, 'autoId')

  if (!boardId || !autoId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and Automation ID are required' })
  }

  const existing = await queryOne(
    'SELECT id FROM board_automations WHERE id = $1 AND board_id = $2',
    [autoId, boardId]
  )

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  }

  await execute('DELETE FROM board_automations WHERE id = $1', [autoId])

  return { success: true }
})
