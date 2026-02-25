/**
 * Board Events — In-memory event bus for real-time board updates.
 *
 * Stores recent board events per board ID and allows SSE endpoints to
 * subscribe and poll for new events. Works within a single server instance.
 * In production, also forwards events to BoardRoom Durable Objects for
 * cross-isolate WebSocket broadcasting.
 *
 * Event types:
 * - task_updated: Task fields changed (title, priority, etc.)
 * - task_created: New task added
 * - task_deleted: Task removed
 * - status_changed: Task status changed
 * - cell_updated: Column value changed
 * - group_updated: Board group changed
 * - column_updated: Column settings changed
 */

import type { H3Event } from 'h3'

export interface BoardEvent {
  id: number
  boardId: string
  type: string
  taskId?: string
  columnId?: string
  userId?: string
  changes?: Record<string, any>
  timestamp: number
}

type BoardEventListener = (event: BoardEvent) => void

const MAX_EVENTS_PER_BOARD = 200
const EVENT_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Global event store — per board
const boardEvents = new Map<string, BoardEvent[]>()
// Per-board subscriber lists
const boardListeners = new Map<string, Set<BoardEventListener>>()
// Global event counter
let eventCounter = 0

/**
 * Emit a board event. Stores in memory and notifies active subscribers.
 * Optionally forwards to BoardRoom Durable Object for cross-isolate broadcasting.
 */
export function emitBoardEvent(params: {
  boardId: string
  type: string
  taskId?: string
  columnId?: string
  userId?: string
  changes?: Record<string, any>
}, h3Event?: H3Event): BoardEvent {
  const event: BoardEvent = {
    id: ++eventCounter,
    boardId: params.boardId,
    type: params.type,
    taskId: params.taskId,
    columnId: params.columnId,
    userId: params.userId,
    changes: params.changes,
    timestamp: Date.now(),
  }

  // Store event
  if (!boardEvents.has(params.boardId)) {
    boardEvents.set(params.boardId, [])
  }
  const events = boardEvents.get(params.boardId)!
  events.push(event)

  // Trim old events
  const cutoff = Date.now() - EVENT_TTL_MS
  while (events.length > 0 && (events.length > MAX_EVENTS_PER_BOARD || events[0].timestamp < cutoff)) {
    events.shift()
  }

  // Notify listeners
  const listeners = boardListeners.get(params.boardId)
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Ignore listener errors
      }
    }
  }

  // Forward to Durable Object for cross-isolate broadcasting (production only)
  if (h3Event) {
    try {
      const env = (h3Event.context as any).cloudflare?.env
      if (env?.BOARD_ROOMS) {
        const doId = env.BOARD_ROOMS.idFromName(params.boardId)
        const stub = env.BOARD_ROOMS.get(doId)
        stub.fetch(new Request(`https://board-do/board/${params.boardId}/emit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })).catch(() => {})
      }
    } catch {
      // DO unavailable — in-memory events still work
    }
  }

  return event
}

/**
 * Get events for a board since a given event ID.
 * Returns empty array if no new events.
 */
export function getBoardEventsSince(boardId: string, sinceId: number): BoardEvent[] {
  const events = boardEvents.get(boardId)
  if (!events) return []
  return events.filter(e => e.id > sinceId)
}

/**
 * Subscribe to live events for a board. Returns unsubscribe function.
 */
export function subscribeToBoardEvents(boardId: string, listener: BoardEventListener): () => void {
  if (!boardListeners.has(boardId)) {
    boardListeners.set(boardId, new Set())
  }
  const listeners = boardListeners.get(boardId)!
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      boardListeners.delete(boardId)
    }
  }
}

/**
 * Get the current latest event ID (for initial connection).
 */
export function getLatestEventId(boardId: string): number {
  const events = boardEvents.get(boardId)
  if (!events || events.length === 0) return 0
  return events[events.length - 1].id
}
