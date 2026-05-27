/**
 * Agency - Staff Reply to Client Request
 * POST /api/agency/client-portal/requests/:id/messages
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

type StaffRequestMessageBody = {
  content?: string
  isInternal?: boolean
  attachments?: unknown[]
}

type ClientRequestRow = {
  id: string
  client_id: string
  client_user_id: string | null
  title: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  const body = await readBody<StaffRequestMessageBody>(event)
  const { content, isInternal, attachments } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message content is required' })
  }

  try {
    // Verify request exists
    const request = await queryOne<ClientRequestRow>('SELECT id, client_id, client_user_id, title FROM client_requests WHERE id = $1', [requestId])
    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    const message = await transaction(async (db) => {
      const messageResult = await db.query<{ id: string, created_at: string }>(`
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

      const row = messageResult.rows[0]

      if (!isInternal) {
        await db.query(`
          INSERT INTO client_activity_log (
            client_id,
            action,
            entity_type,
            entity_id,
            details
          ) VALUES ($1, 'agency_request_reply', 'client_request', $2, $3)
        `, [
          request.client_id,
          requestId,
          JSON.stringify({
            agencyUserId: user.id,
            messageId: row.id
          })
        ])

        if (request.client_user_id) {
          await db.query(`
            INSERT INTO client_notifications (
              client_user_id,
              type,
              title,
              message,
              action_url
            ) VALUES ($1, 'comment_reply', $2, $3, $4)
          `, [
            request.client_user_id,
            'Agency replied to your request',
            `New reply on "${request.title}".`,
            `/portal/requests/${requestId}`
          ])
        }
      }

      return row
    })

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
