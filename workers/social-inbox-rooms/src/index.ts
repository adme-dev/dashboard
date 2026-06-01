/**
 * Social Inbox Rooms Worker — entry point.
 *
 * Routes to a per-client InboxRoom Durable Object. Each client_id gets its own DO instance,
 * which is the cross-isolate source of truth for that client's live inbox events.
 *
 * Paths:
 *   POST /inbox/:clientId/emit     — store an event (from the dashboard's emit bus)
 *   GET  /inbox/:clientId/events   — events since ?since= (SSE relay polls this)
 */
import { InboxRoom } from './InboxRoom'

interface Env {
  SOCIAL_INBOX_ROOMS: DurableObjectNamespace<InboxRoom>
}

export { InboxRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/inbox\/([^/]+)(\/(?:emit|events))?$/)
    if (!match) return new Response('Not found. Use /inbox/:clientId', { status: 404 })

    const clientId = match[1]
    const id = env.SOCIAL_INBOX_ROOMS.idFromName(clientId)
    const stub = env.SOCIAL_INBOX_ROOMS.get(id)
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
