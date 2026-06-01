// server/utils/socialInbox/events.ts
// Real-time event bus for the engagement inbox (Slice 2d). Mirrors server/utils/boardEvents.ts:
// a per-isolate in-memory store + subscriber set, plus fire-and-forget forwarding to a per-CLIENT
// Durable Object (SOCIAL_INBOX_ROOMS) so SSE subscribers on other isolates also receive events.
//
// Events are keyed by client_id (the inbox is client-scoped). The DO is the cross-isolate source
// of truth in production; the in-memory bus is correct in dev / single-isolate. Everything degrades
// gracefully: if the DO binding is absent, the in-memory path still works; if SSE fails entirely,
// the client falls back to polling.
import type { H3Event } from 'h3'
import { createEventStream } from 'h3'

export interface InboxEvent {
  id: number
  clientId: string
  type: string // 'message.added' | 'conversation.changed'
  conversationId?: string
  actorId?: string
  timestamp: number
}

type InboxEventListener = (event: InboxEvent) => void

const MAX_EVENTS_PER_CLIENT = 200
const EVENT_TTL_MS = 5 * 60 * 1000

const clientEvents = new Map<string, InboxEvent[]>()
const clientListeners = new Map<string, Set<InboxEventListener>>()
let eventCounter = 0

/**
 * Emit an inbox event: store it in the per-client buffer, notify in-isolate subscribers, and
 * (when a request context with the DO binding is available) forward it to the client's DO room.
 */
export function emitInboxEvent(
  params: { clientId: string; type: string; conversationId?: string; actorId?: string },
  h3Event?: H3Event,
): InboxEvent {
  const event: InboxEvent = {
    id: ++eventCounter,
    clientId: params.clientId,
    type: params.type,
    conversationId: params.conversationId,
    actorId: params.actorId,
    timestamp: Date.now(),
  }

  if (!clientEvents.has(params.clientId)) clientEvents.set(params.clientId, [])
  const events = clientEvents.get(params.clientId)!
  events.push(event)

  const cutoff = Date.now() - EVENT_TTL_MS
  while (events.length > 0 && (events.length > MAX_EVENTS_PER_CLIENT || events[0].timestamp < cutoff)) {
    events.shift()
  }

  const listeners = clientListeners.get(params.clientId)
  if (listeners) {
    for (const listener of listeners) {
      try { listener(event) } catch { /* ignore listener errors */ }
    }
  }

  // Cross-isolate broadcast (production). Fire-and-forget; in-memory path still works without it.
  if (h3Event) {
    try {
      const env = (h3Event.context as any).cloudflare?.env
      if (env?.SOCIAL_INBOX_ROOMS) {
        const stub = env.SOCIAL_INBOX_ROOMS.get(env.SOCIAL_INBOX_ROOMS.idFromName(params.clientId))
        stub.fetch(new Request(`https://social-inbox-do/inbox/${params.clientId}/emit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })).catch(() => {})
      }
    } catch { /* DO unavailable — in-memory events still work */ }
  }

  return event
}

/** Events for a client since a given id (in-memory path / DO fallback dev). */
export function getInboxEventsSince(clientId: string, sinceId: number): InboxEvent[] {
  const events = clientEvents.get(clientId)
  if (!events) return []
  return events.filter(e => e.id > sinceId)
}

/** Subscribe to live events for a client. Returns an unsubscribe function. */
export function subscribeToInboxEvents(clientId: string, listener: InboxEventListener): () => void {
  if (!clientListeners.has(clientId)) clientListeners.set(clientId, new Set())
  const listeners = clientListeners.get(clientId)!
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clientListeners.delete(clientId)
  }
}

/** Latest event id for a client (baseline for a fresh SSE connection). */
export function getLatestInboxEventId(clientId: string): number {
  const events = clientEvents.get(clientId)
  if (!events || events.length === 0) return 0
  return events[events.length - 1].id
}

function formatInbox(e: InboxEvent) {
  return { type: e.type, conversationId: e.conversationId, actorId: e.actorId, timestamp: e.timestamp }
}

/**
 * Open an SSE stream of a client's inbox events. Identical strategy to the board SSE endpoint:
 * when the DO binding exists (production) the DO is the single source and we poll it for deltas
 * (the in-memory bus is per-isolate); otherwise (dev / single isolate) we subscribe to the
 * in-memory bus directly. The CALLER is responsible for authorizing access to `clientId` —
 * the portal endpoint passes its session clientId so a client can never stream another tenant.
 */
export async function streamInboxEvents(h3Event: H3Event, clientId: string, lastEventId: number) {
  const eventStream = createEventStream(h3Event)
  const room = (h3Event.context as any).cloudflare?.env?.SOCIAL_INBOX_ROOMS

  if (room) {
    const stub = room.get(room.idFromName(clientId))
    let lastSentId = lastEventId
    const pushSince = async () => {
      try {
        const res = await stub.fetch(`https://social-inbox-do/inbox/${clientId}/events?since=${lastSentId}`)
        if (!res.ok) return
        const data = await res.json() as { events: InboxEvent[]; lastEventId: number }
        // If we're ahead of the DO (it cold-started and reset its counter), adopt its baseline so
        // the next real event isn't filtered out by our stale high-water mark.
        if (lastSentId > data.lastEventId) lastSentId = data.lastEventId
        for (const ev of data.events) {
          if (ev.id <= lastSentId) continue
          lastSentId = ev.id
          await eventStream.push({ id: String(ev.id), event: 'inbox_update', data: JSON.stringify(formatInbox(ev)) })
        }
      } catch { /* DO unreachable — client falls back to polling */ }
    }
    await pushSince()
    await eventStream.push({ id: String(lastSentId), event: 'connected', data: JSON.stringify({ clientId, timestamp: Date.now() }) })
    const pollTimer = setInterval(pushSince, 2000)
    const heartbeat = setInterval(async () => {
      try { await eventStream.push({ event: 'heartbeat', data: '{}' }) } catch { clearInterval(heartbeat) }
    }, 30000)
    eventStream.onClosed(async () => { clearInterval(pollTimer); clearInterval(heartbeat); await eventStream.close() })
    return eventStream.send()
  }

  // Dev / no DO binding: single-isolate in-memory bus.
  for (const ev of getInboxEventsSince(clientId, lastEventId)) {
    await eventStream.push({ id: String(ev.id), event: 'inbox_update', data: JSON.stringify(formatInbox(ev)) })
  }
  await eventStream.push({
    id: String(getLatestInboxEventId(clientId) || lastEventId),
    event: 'connected', data: JSON.stringify({ clientId, timestamp: Date.now() }),
  })
  const unsubscribe = subscribeToInboxEvents(clientId, async (ev) => {
    try { await eventStream.push({ id: String(ev.id), event: 'inbox_update', data: JSON.stringify(formatInbox(ev)) }) } catch { /* closed */ }
  })
  const heartbeat = setInterval(async () => {
    try { await eventStream.push({ event: 'heartbeat', data: '{}' }) } catch { clearInterval(heartbeat) }
  }, 30000)
  eventStream.onClosed(async () => { unsubscribe(); clearInterval(heartbeat); await eventStream.close() })
  return eventStream.send()
}
