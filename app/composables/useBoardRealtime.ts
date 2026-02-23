/**
 * Board real-time composable
 *
 * Connects to the board SSE stream for live updates.
 * Falls back to polling if SSE is not supported or fails.
 */

export interface BoardRealtimeEvent {
  type: string
  taskId?: string
  columnId?: string
  userId?: string
  changes?: Record<string, any>
  timestamp: number
}

interface UseBoardRealtimeOptions {
  /** Called when any board update event arrives */
  onEvent?: (event: BoardRealtimeEvent) => void
  /** Called to trigger a full board refresh */
  onRefresh?: () => void
  /** Polling interval in ms (fallback when SSE fails). Default: 15000 */
  pollInterval?: number
  /** Whether to auto-connect on creation. Default: true */
  autoConnect?: boolean
}

export function useBoardRealtime(boardId: Ref<string>, options: UseBoardRealtimeOptions = {}) {
  const {
    onEvent,
    onRefresh,
    pollInterval = 15000,
    autoConnect = true,
  } = options

  const connected = ref(false)
  const lastEventId = ref(0)
  const eventCount = ref(0)

  let eventSource: EventSource | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_DELAY = 30000

  function connect() {
    if (import.meta.server) return
    disconnect()

    const url = `/api/agency/boards/${boardId.value}/events?lastEventId=${lastEventId.value}`

    try {
      eventSource = new EventSource(url)

      eventSource.addEventListener('connected', (e: MessageEvent) => {
        connected.value = true
        reconnectAttempts = 0
        if (e.lastEventId) {
          lastEventId.value = Number(e.lastEventId)
        }
      })

      eventSource.addEventListener('board_update', (e: MessageEvent) => {
        if (e.lastEventId) {
          lastEventId.value = Number(e.lastEventId)
        }
        eventCount.value++

        try {
          const data: BoardRealtimeEvent = JSON.parse(e.data)
          onEvent?.(data)
          // Trigger refresh on data-changing events
          if (shouldRefresh(data.type)) {
            onRefresh?.()
          }
        } catch {
          // Invalid event data
        }
      })

      eventSource.addEventListener('heartbeat', () => {
        // Connection is alive
      })

      eventSource.onerror = () => {
        connected.value = false
        eventSource?.close()
        eventSource = null
        scheduleReconnect()
      }
    } catch {
      // EventSource not supported or URL error — fall back to polling
      startPolling()
    }
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
    stopPolling()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
    reconnectAttempts++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(() => {
      onRefresh?.()
    }, pollInterval)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function shouldRefresh(eventType: string): boolean {
    return [
      'task_updated',
      'task_created',
      'task_deleted',
      'status_changed',
      'cell_updated',
      'group_updated',
      'column_updated',
    ].includes(eventType)
  }

  // Reconnect when board changes
  watch(boardId, () => {
    if (autoConnect) {
      lastEventId.value = 0
      eventCount.value = 0
      reconnectAttempts = 0
      connect()
    }
  })

  // Auto-connect on mount
  if (autoConnect) {
    onMounted(() => connect())
  }

  // Cleanup on unmount
  onUnmounted(() => disconnect())

  return {
    connected,
    lastEventId,
    eventCount,
    connect,
    disconnect,
  }
}
