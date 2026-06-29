/**
 * InboxRoom Durable Object
 *
 * Cross-isolate fan-out for the social engagement inbox (Slice 2d). One DO instance per
 * client_id. Mirrors BoardRoom but SSE-only: the dashboard's SSE endpoints poll `/events?since=`
 * to relay events that were emitted on a different isolate. Events flow through this room as
 * short-lived notifications; stateful presence still lives in the dashboard client.
 *
 * Events are held in-memory with TTL expiry (no SQLite); a missed event only costs a delayed
 * refresh, and the client also polls as a backstop, so durability isn't required.
 */
import { DurableObject } from 'cloudflare:workers'

interface InboxEvent {
  id: number
  clientId: string
  type: string
  conversationId?: string
  actorId?: string
  actorName?: string
  active?: boolean
  timestamp: number
}

type Env = Record<string, never>

const MAX_EVENTS = 200
const EVENT_TTL_MS = 5 * 60 * 1000

export class InboxRoom extends DurableObject<Env> {
  private events: InboxEvent[] = []
  private eventCounter = 0

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /emit — receive an event from the main app, store it.
    if (request.method === 'POST' && url.pathname.endsWith('/emit')) {
      try {
        const incoming = await request.json() as Omit<InboxEvent, 'id'>
        const stored: InboxEvent = {
          ...incoming,
          id: ++this.eventCounter,
          timestamp: incoming.timestamp || Date.now()
        }
        this.events.push(stored)
        this.trimOldEvents()
        return Response.json({ ok: true, eventId: stored.id })
      } catch {
        return Response.json({ error: 'Invalid event data' }, { status: 400 })
      }
    }

    // GET /events?since=N — events newer than N + the current high-water mark.
    if (url.pathname.endsWith('/events')) {
      let since = Number(url.searchParams.get('since')) || 0
      // Self-heal a stale-ahead client: after a DO eviction the counter resets to 0, but a
      // reconnecting client may carry a higher `since` from before. Clamp it so the client
      // re-syncs to this DO's current sequence instead of silently skipping every new event.
      if (since > this.eventCounter) since = 0
      return Response.json({
        events: this.events.filter(e => e.id > since),
        lastEventId: this.eventCounter
      })
    }

    return new Response('Use POST /inbox/:clientId/emit or GET /inbox/:clientId/events', { status: 404 })
  }

  private trimOldEvents(): void {
    const cutoff = Date.now() - EVENT_TTL_MS
    while (this.events.length > 0 && (this.events.length > MAX_EVENTS || this.events[0].timestamp < cutoff)) {
      this.events.shift()
    }
  }
}
