/**
 * Chat Rooms Worker — entry point
 *
 * Routes WebSocket upgrade requests to the appropriate ChatRoom Durable Object.
 * Each chat channel gets its own DO instance keyed by channelId.
 */

import { ChatRoom } from './ChatRoom'

interface Env {
  CHAT_ROOMS: DurableObjectNamespace<ChatRoom>
  CHAT_QUEUE: Queue
  API_URL: string
  INTERNAL_API_KEY: string
}

export { ChatRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Expected path: /chat/:channelId or /chat/:channelId/online
    const match = url.pathname.match(/^\/chat\/([^/]+)(\/online)?$/)
    if (!match) {
      return new Response('Not found. Use /chat/:channelId', { status: 404 })
    }

    const channelId = match[1]

    // Get or create a DO instance keyed by channelId
    const id = env.CHAT_ROOMS.idFromName(channelId)
    const stub = env.CHAT_ROOMS.get(id)

    // Forward the request to the Durable Object
    return stub.fetch(request)
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    // Process queued chat notifications
    for (const msg of batch.messages) {
      const payload = msg.body as {
        type: string
        channelId: string
        messageId: number
        userId: string
        userName: string
        content: string
        threadParentId: number | null
        metadata: Record<string, unknown>
        createdAt: string
      }

      if (payload.type === 'new_message') {
        try {
          // Call the main app's notification endpoint
          await fetch(`${env.API_URL}/api/internal/chat-archive`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.INTERNAL_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              channelId: payload.channelId,
              messages: [{
                doMessageId: payload.messageId,
                userId: payload.userId,
                content: payload.content,
                threadParentId: payload.threadParentId,
                metadata: payload.metadata,
                createdAt: payload.createdAt
              }]
            })
          })
          msg.ack()
        } catch (err) {
          console.error('[ChatQueue] Failed to archive message:', err)
          msg.retry()
        }
      } else {
        msg.ack()
      }
    }
  }
} satisfies ExportedHandler<Env>
