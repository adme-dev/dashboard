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
 */

import { createEventStream, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { subscribeToBoardEvents, getBoardEventsSince, getLatestEventId } from '~~/server/utils/boardEvents'
import type { BoardEvent } from '~~/server/utils/boardEvents'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const query = getQuery(event)
  const lastEventId = Number(query.lastEventId) || 0

  const eventStream = createEventStream(event)

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
