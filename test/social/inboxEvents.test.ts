import { describe, it, expect, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  emitInboxEvent,
  formatInboxEvent,
  getInboxEventsSince,
  getLatestInboxEventId,
  subscribeToInboxEvents
} from '~~/server/utils/socialInbox/events'

// Each test uses a unique clientId so the module-level bus doesn't leak state between tests.
describe('inbox event bus', () => {
  it('stores per-client events and returns only those newer than a cursor', () => {
    const c = 'client-since'
    const e1 = emitInboxEvent({ clientId: c, type: 'message.added', conversationId: 'a' })
    const e2 = emitInboxEvent({ clientId: c, type: 'conversation.changed', conversationId: 'b' })
    expect(getInboxEventsSince(c, 0).map(e => e.id)).toEqual([e1.id, e2.id])
    expect(getInboxEventsSince(c, e1.id).map(e => e.id)).toEqual([e2.id])
    expect(getInboxEventsSince(c, e2.id)).toEqual([])
  })

  it('isolates events between clients', () => {
    emitInboxEvent({ clientId: 'tenant-A', type: 'message.added' })
    expect(getInboxEventsSince('tenant-B', 0)).toEqual([])
  })

  it('notifies live subscribers and stops after unsubscribe', () => {
    const c = 'client-sub'
    const seen: string[] = []
    const unsub = subscribeToInboxEvents(c, e => seen.push(e.type))
    emitInboxEvent({ clientId: c, type: 'message.added' })
    unsub()
    emitInboxEvent({ clientId: c, type: 'conversation.changed' })
    expect(seen).toEqual(['message.added'])
  })

  it('reports the latest event id for a client', () => {
    const c = 'client-latest'
    expect(getLatestInboxEventId(c)).toBe(0)
    const e = emitInboxEvent({ clientId: c, type: 'message.added' })
    expect(getLatestInboxEventId(c)).toBe(e.id)
  })

  it('caps the per-client buffer (does not grow unbounded)', () => {
    const c = 'client-cap'
    for (let i = 0; i < 250; i++) emitInboxEvent({ clientId: c, type: 'message.added' })
    expect(getInboxEventsSince(c, 0).length).toBeLessThanOrEqual(200)
  })

  it('forwards to the SOCIAL_INBOX_ROOMS DO when a request context is provided', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')))
    const stub = { fetch: fetchSpy }
    const env = { SOCIAL_INBOX_ROOMS: { idFromName: vi.fn(() => 'doid'), get: vi.fn(() => stub) } }
    const h3Event = { context: { cloudflare: { env } } } as unknown as H3Event
    emitInboxEvent({ clientId: 'client-do', type: 'message.added', conversationId: 'x' }, h3Event)
    expect(env.SOCIAL_INBOX_ROOMS.idFromName).toHaveBeenCalledWith('client-do')
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('keeps reply typing metadata in the client-facing event payload', () => {
    const event = emitInboxEvent({
      clientId: 'client-typing',
      type: 'reply.typing',
      conversationId: 'conv-1',
      actorId: 'user-1',
      actorName: 'Kelly',
      active: true
    })

    expect(formatInboxEvent(event)).toMatchObject({
      type: 'reply.typing',
      conversationId: 'conv-1',
      actorId: 'user-1',
      actorName: 'Kelly',
      active: true
    })
  })
})
