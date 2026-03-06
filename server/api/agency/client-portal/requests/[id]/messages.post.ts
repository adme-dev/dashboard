/**
 * Agency - Staff Reply to Client Request
 * POST /api/agency/client-portal/requests/:id/messages
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  const body = await readBody(event)
  const { content, isInternal, attachments } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message content is required' })
  }

  try {
    // Verify request exists
    const request = await queryOne('SELECT id FROM client_requests WHERE id = $1', [requestId])
    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    const message = await queryOne(`
      INSERT INTO client_request_messages (request_id, team_member_id, content, attachments, is_internal)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [
      requestId,
      user.id,
      content.trim(),
      JSON.stringify(attachments || []),
      isInternal ?? false
    ])

    return {
      id: message.id,
      createdAt: message.created_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add message:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add message' })
  }
})
