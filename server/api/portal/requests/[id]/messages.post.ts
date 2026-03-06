/**
 * Client Portal - Add Message to Request
 * POST /api/portal/requests/:id/messages
 */

import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  const body = await readBody(event)
  const { content, attachments } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message content is required' })
  }

  try {
    // Verify request belongs to client and is not closed
    const request = await queryOne(
      'SELECT id, status FROM client_requests WHERE id = $1 AND client_id = $2',
      [requestId, clientUser.clientId]
    )

    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    if (['completed', 'closed', 'cancelled'].includes(request.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot add messages to a closed request' })
    }

    const message = await queryOne(`
      INSERT INTO client_request_messages (request_id, client_user_id, content, attachments, is_internal)
      VALUES ($1, $2, $3, $4, false)
      RETURNING id, created_at
    `, [
      requestId,
      clientUser.id,
      content.trim(),
      JSON.stringify(attachments || [])
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
