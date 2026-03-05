/**
 * Board real-time composable
 *
 * Connection strategy: WebSocket (DO) -> SSE -> Polling
 * WebSocket provides full real-time + presence via Durable Objects.
 * SSE/Polling fallbacks for local dev or when DO unavailable.
 */

export interface BoardRealtimeEvent {
  type: string
  taskId?: string
  columnId?: string
  userId?: string
  changes?: Record<string, any>
  timestamp: number
}

interface OnlineUser {
  userId: string
  userName: string
  userAvatar?: string
}

interface UseBoardRealtimeOptions {
  onEvent?: (event: BoardRealtimeEvent) => void
  onRefresh?: () => void
  pollInterval?: number
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
  const onlineUsers = ref<OnlineUser[]>([])
  const connectionType = ref<'websocket' | 'sse' | 'polling'>('polling')

  let ws: WebSocket | null = null
  let eventSource: EventSource | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_DELAY = 30000

  function connect() {
    if (import.meta.server) return
    disconnect()
    reconnectAttempts = 0
    connectWebSocket()
  }

  let wsFailed = false // Track if WS has already failed this session

  function connectWebSocket() {
    if (import.meta.server) return

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/agency/boards/${boardId.value}/connect`

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connected.value = true
        connectionType.value = 'websocket'
        reconnectAttempts = 0
        wsFailed = false
      }

      ws.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)

          if (data.type === 'history') {
            lastEventId.value = data.lastEventId || 0
            // Process any missed events from history
            if (data.events?.length) {
              for (const evt of data.events) {
                eventCount.value++
                onEvent?.(evt)
              }
              onRefresh?.()
            }
          } else if (data.type === 'presence') {
            onlineUsers.value = data.users || []
          } else if (data.type === 'board_update') {
            const evt = data.event as BoardRealtimeEvent
            lastEventId.value = data.event?.id || lastEventId.value
            eventCount.value++
            onEvent?.(evt)
            if (shouldRefresh(evt.type)) {
              onRefresh?.()
            }
          }
        } catch {
          // Invalid message
        }
      }

      ws.onerror = () => {
        // WebSocket failed — clean up and let onclose handle fallback
        wsFailed = true
        cleanupWebSocket()
      }

      ws.onclose = (e) => {
        cleanupWebSocket()
        if (wsFailed) {
          // WS never connected — fall back to SSE (once), then polling
          wsFailed = false
          fallbackToSSE()
        } else if (e.code !== 1000) {
          // Was connected but lost — try reconnect
          scheduleReconnect()
        }
      }
    } catch {
      // WebSocket not available — fall back to polling directly
      startPolling()
    }
  }

  function fallbackToSSE() {
    if (import.meta.server) return

    // Clean up any existing SSE connection first
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }

    try {
      const url = `/api/agency/boards/${boardId.value}/events?lastEventId=${lastEventId.value}`
      eventSource = new EventSource(url)

      eventSource.addEventListener('connected', (e: MessageEvent) => {
        connected.value = true
        connectionType.value = 'sse'
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
        // SSE also failed — settle into polling
        startPolling()
      }
    } catch {
      startPolling()
    }
  }

  function disconnect() {
    cleanupWebSocket()
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
    onlineUsers.value = []
    connectionType.value = 'polling'
    stopPolling()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function cleanupWebSocket() {
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      try { ws.close() } catch {}
      ws = null
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectAttempts++

    // After 2 failed reconnects, just settle into polling
    if (reconnectAttempts > 2) {
      startPolling()
      return
    }

    const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWebSocket()
    }, delay)
  }

  function startPolling() {
    stopPolling()
    connectionType.value = 'polling'
    connected.value = true // "connected" in a polling sense
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
      onlineUsers.value = []
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
    onlineUsers,
    connectionType,
    connect,
    disconnect,
  }
}
