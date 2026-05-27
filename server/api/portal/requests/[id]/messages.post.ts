/**
 * Client Portal - Add Message to Request
 * POST /api/portal/requests/:id/messages
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { createNotification } from '~~/server/utils/notifications'

type ClientRequestMessageTarget = {
  id: string
  status: string
  title: string
  assigned_to: string | null
}

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
    const request = await queryOne<ClientRequestMessageTarget>(
      'SELECT id, status, title, assigned_to FROM client_requests WHERE id = $1 AND client_id = $2',
      [requestId, clientUser.clientId]
    )

    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    if (['completed', 'closed', 'cancelled'].includes(request.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot add messages to a closed request' })
    }

    const message = await transaction(async (client) => {
      const inserted = await client.query(`
        INSERT INTO client_request_messages (request_id, client_user_id, content, attachments, is_internal)
        VALUES ($1, $2, $3, $4, false)
        RETURNING id, created_at
      `, [
        requestId,
        clientUser.id,
        content.trim(),
        JSON.stringify(attachments || [])
      ])

      const result = inserted.rows[0]

      await client.query(`
        INSERT INTO client_activity_log (
          client_user_id, client_id, action, entity_type, entity_id, details
        ) VALUES ($1, $2, 'client_request_message_added', 'client_request', $3, $4)
      `, [
        clientUser.id,
        clientUser.clientId,
        requestId,
        JSON.stringify({ messageId: result.id })
      ])

      return result
    })

    if (request.assigned_to) {
      await createNotification({
        userId: request.assigned_to,
        type: 'team_update',
        title: 'Client replied to a request',
        message: `New client reply on "${request.title}".`,
        link: `/agency/client-portal?tab=requests&requestId=${requestId}`,
        metadata: {
          clientId: clientUser.clientId,
          requestId,
          messageId: message.id
        },
        reason: 'direct'
      })
    }

    return {
      id: message.id,
      createdAt: message.created_at
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to add message:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add message' })
  }
})
