/**
 * Get Board Email Address
 * GET /api/agency/boards/:id/email
 *
 * Returns the email-to-board address for a board.
 * Generates a token if one doesn't exist yet.
 */

import crypto from 'crypto'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  let board = await queryOne(
    'SELECT id, board_email_token FROM departments WHERE id = $1',
    [boardId]
  )

  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  if (!board.board_email_token) {
    const token = crypto.randomBytes(16).toString('hex').substring(0, 16)
    board = await queryOne(
      'UPDATE departments SET board_email_token = $1 WHERE id = $2 RETURNING id, board_email_token',
      [token, boardId]
    )
  }

  const domain = process.env.MAIL_DOMAIN || 'mail.yourdomain.com'
  return {
    email: `board-${board.board_email_token}@${domain}`,
    token: board.board_email_token,
    enabled: true
  }
})
