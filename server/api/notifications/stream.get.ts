/**
 * Server-Sent Events (SSE) endpoint for real-time notifications
 * GET /api/notifications/stream
 *
 * Establishes a persistent connection for real-time notification delivery
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

// Store active connections per user
const connections = new Map<string, Set<WritableStreamDefaultWriter>>()

// Polling interval for new notifications (in ms)
const POLL_INTERVAL = 5000

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Set SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no') // Disable nginx buffering

  const userId = user.id
  let lastCheckTime = new Date()
  let isConnectionClosed = false

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE event
      const sendEvent = (eventType: string, data: any) => {
        if (isConnectionClosed) return
        try {
          const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(new TextEncoder().encode(message))
        } catch {
          // Connection closed
          isConnectionClosed = true
        }
      }

      // Send initial connection event
      sendEvent('connected', { userId, timestamp: new Date().toISOString() })

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (isConnectionClosed) {
          clearInterval(heartbeatInterval)
          return
        }
        sendEvent('heartbeat', { timestamp: new Date().toISOString() })
      }, 30000)

      // Poll for new notifications
      const pollInterval = setInterval(async () => {
        if (isConnectionClosed) {
          clearInterval(pollInterval)
          return
        }

        try {
          // Check for new notifications since last check
          const newNotifications = await queryRows(`
            SELECT
              n.id, n.type, n.title, n.message, n.link, n.metadata, n.created_at,
              tm.id as actor_id, tm.name as actor_name
            FROM notifications n
            LEFT JOIN team_members tm ON n.actor_id = tm.id
            WHERE n.user_id = $1
              AND n.created_at > $2
              AND n.is_read = false
            ORDER BY n.created_at ASC
          `, [userId, lastCheckTime.toISOString()])

          if (newNotifications.length > 0) {
            for (const notification of newNotifications) {
              sendEvent('notification', {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                link: notification.link,
                metadata: notification.metadata,
                createdAt: notification.created_at,
                actor: notification.actor_id ? {
                  id: notification.actor_id,
                  name: notification.actor_name
                } : null
              })
            }
            lastCheckTime = new Date()
          }

          // Also check unread count
          const countResult = await queryRows(`
            SELECT COUNT(*) as count FROM notifications
            WHERE user_id = $1 AND is_read = false
          `, [userId])

          const unreadCount = parseInt(countResult[0]?.count || '0', 10)
          sendEvent('unread_count', { count: unreadCount })
        } catch (error) {
          console.error('Error polling notifications:', error)
        }
      }, POLL_INTERVAL)

      // Handle client disconnect
      event.node.req.on('close', () => {
        isConnectionClosed = true
        clearInterval(heartbeatInterval)
        clearInterval(pollInterval)
        controller.close()
      })
    }
  })

  return sendStream(event, stream)
})

/**
 * Helper to broadcast notification to a specific user
 * Can be called from other parts of the application
 */
export function broadcastNotification(userId: string, notification: any) {
  const userConnections = connections.get(userId)
  if (!userConnections) return

  const message = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`
  const encoded = new TextEncoder().encode(message)

  for (const writer of userConnections) {
    try {
      writer.write(encoded)
    } catch {
      // Connection closed, will be cleaned up
    }
  }
}
