/**
 * Board Events SSE Stream
 * GET /api/agency/boards/:id/events
 *
 * Server-Sent Events endpoint for real-time board updates.
 * Accepts ?lastEventId=N query param for resuming from a specific event.
 *
 * Sends events as:
 *   event: board_update
 *   id: <eventId>
 *   data: { type, taskId?, columnId?, changes?, timestamp }
 *
 * Accepts either a department UUID or a slug. Subscribers MUST be keyed by the
 * UUID — server/utils/boardEvents.ts emits with the UUID, so a slug-keyed
 * subscriber would silently never receive events.
 */

import { createEventStream, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { subscribeToBoardEvents, getBoardEventsSince, getLatestEventId } from '~~/server/utils/boardEvents'
import type { BoardEvent } from '~~/server/utils/boardEvents'
import { queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const boardIdOrSlug = getRouterParam(event, 'id')
  if (!boardIdOrSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const board = isUUID(boardIdOrSlug)
    ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardIdOrSlug])
    : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardIdOrSlug])

  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const boardId: string = board.id

  const query = getQuery(event)
  const lastEventId = Number(query.lastEventId) || 0

  const eventStream = createEventStream(event)

  // Cross-isolate path: relay from the BoardRoom Durable Object.
  // The in-memory bus below is per-isolate, so an SSE subscriber here would
  // miss events emitted on a different isolate. When the DO binding exists
  // (production), the DO is the single source of truth — poll it for deltas.
  const boardRoom = (event.context as any).cloudflare?.env?.BOARD_ROOMS
  if (boardRoom) {
    const stub = boardRoom.get(boardRoom.idFromName(boardId))
    let lastSentId = lastEventId

    const pushSince = async () => {
      try {
        const res = await stub.fetch(`https://board-do/board/${boardId}/events?since=${lastSentId}`)
        if (!res.ok) return
        const data = await res.json() as { events: BoardEvent[]; lastEventId: number }
        for (const be of data.events) {
          if (be.id <= lastSentId) continue
          lastSentId = be.id
          await eventStream.push({
            id: String(be.id),
            event: 'board_update',
            data: JSON.stringify(formatEvent(be)),
          })
        }
      } catch {
        // DO unreachable — client heartbeat will lapse and it falls back to polling.
      }
    }

    // Initial catch-up, then a baseline so the client knows where it stands.
    await pushSince()
    await eventStream.push({
      id: String(lastSentId),
      event: 'connected',
      data: JSON.stringify({ boardId, timestamp: Date.now() }),
    })

    const pollTimer = setInterval(pushSince, 2000)
    const heartbeatTimer = setInterval(async () => {
      try {
        await eventStream.push({ event: 'heartbeat', data: JSON.stringify({ timestamp: Date.now() }) })
      } catch {
        clearInterval(heartbeatTimer)
      }
    }, 30000)

    eventStream.onClosed(async () => {
      clearInterval(pollTimer)
      clearInterval(heartbeatTimer)
      await eventStream.close()
    })

    return eventStream.send()
  }

  // Dev / no DO binding: single-isolate in-memory bus (correct because there's
  // only one isolate locally).
  // Send any missed events since lastEventId
  const missedEvents = getBoardEventsSince(boardId, lastEventId)
  for (const boardEvent of missedEvents) {
    await eventStream.push({
      id: String(boardEvent.id),
      event: 'board_update',
      data: JSON.stringify(formatEvent(boardEvent)),
    })
  }

  // Send heartbeat with current latest ID so client knows the baseline
  await eventStream.push({
    id: String(getLatestEventId(boardId) || lastEventId),
    event: 'connected',
    data: JSON.stringify({ boardId, timestamp: Date.now() }),
  })

  // Subscribe to new events
  const unsubscribe = subscribeToBoardEvents(boardId, async (boardEvent: BoardEvent) => {
    try {
      await eventStream.push({
        id: String(boardEvent.id),
        event: 'board_update',
        data: JSON.stringify(formatEvent(boardEvent)),
      })
    } catch {
      // Connection closed
    }
  })

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(async () => {
    try {
      await eventStream.push({
        event: 'heartbeat',
        data: JSON.stringify({ timestamp: Date.now() }),
      })
    } catch {
      clearInterval(heartbeatInterval)
    }
  }, 30000)

  // Cleanup on close
  eventStream.onClosed(async () => {
    unsubscribe()
    clearInterval(heartbeatInterval)
    await eventStream.close()
  })

  return eventStream.send()
})

function formatEvent(e: BoardEvent) {
  return {
    type: e.type,
    taskId: e.taskId,
    columnId: e.columnId,
    userId: e.userId,
    changes: e.changes,
    timestamp: e.timestamp,
  }
}
