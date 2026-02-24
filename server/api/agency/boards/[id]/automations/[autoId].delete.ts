/**
 * Delete a board automation
 */
import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const autoId = getRouterParam(event, 'autoId')

  if (!boardId || !autoId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and Automation ID are required' })
  }

  await requireBoardAccess(event, boardId)

  try {
    const existing = await queryOne(
      'SELECT id FROM board_automations WHERE id = $1 AND board_id = $2',
      [autoId, boardId]
    )

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
    }

    await execute('DELETE FROM board_automations WHERE id = $1', [autoId])

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    if (error.message?.includes('does not exist')) {
      throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
    }
    throw error
  }
})
