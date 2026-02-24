/**
 * Disable Board Email
 * DELETE /api/agency/boards/:id/email
 *
 * Sets the board_email_token to NULL, disabling email-to-board.
 */

import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const board = await queryOne('SELECT id FROM departments WHERE id = $1', [boardId])
  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  await execute(
    'UPDATE departments SET board_email_token = NULL WHERE id = $1',
    [boardId]
  )

  return { success: true }
})
