/**
 * Regenerate Board Email Token
 * POST /api/agency/boards/:id/email/regenerate
 *
 * Generates a new token, invalidating the previous email address.
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

  const board = await queryOne('SELECT id FROM departments WHERE id = $1', [boardId])
  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const token = crypto.randomBytes(16).toString('hex').substring(0, 16)
  const updated = await queryOne(
    'UPDATE departments SET board_email_token = $1 WHERE id = $2 RETURNING id, board_email_token',
    [token, boardId]
  )

  const domain = process.env.MAIL_DOMAIN || 'mail.yourdomain.com'
  return {
    email: `board-${updated.board_email_token}@${domain}`,
    token: updated.board_email_token,
    enabled: true
  }
})
