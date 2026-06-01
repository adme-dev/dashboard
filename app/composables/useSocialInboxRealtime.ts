// app/composables/useSocialInboxRealtime.ts
// Live inbox updates via SSE with graceful degradation to polling. Server→client only (no
// WebSocket/presence): on any event for the client's room the caller refreshes the list, and the
// thread if the event's conversationId is the one open. Mirrors the board realtime fallback chain,
// minus WebSocket. Used by both the agency inbox (endpoint carries ?clientId=) and the portal
// (endpoint is fixed + session-scoped server-side).
import type { Ref } from 'vue'

export interface InboxRealtimeEvent {
  type: string
  conversationId?: string
  actorId?: string
  timestamp: number
}

interface Options {
  onRefresh?: () => void
  onEvent?: (e: InboxRealtimeEvent) => void
  pollInterval?: number
  autoConnect?: boolean
}

/** `endpoint` is the SSE URL without lastEventId, or null to stay disconnected. */
export function useSocialInboxRealtime(endpoint: Ref<string | null>, options: Options = {}) {
  const { onRefresh, onEvent, pollInterval = 15000, autoConnect = true } = options

  const connected = ref(false)
  const connectionType = ref<'sse' | 'polling'>('polling')
  const lastEventId = ref(0)

  let eventSource: EventSource | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let sseErrorCount = 0
  const MAX_SSE_ERRORS = 3

  function buildUrl(base: string) {
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}lastEventId=${lastEventId.value}`
  }

  function connectSSE() {
    if (import.meta.server || !endpoint.value) return
    closeSSE()
    try {
      eventSource = new EventSource(buildUrl(endpoint.value))

      eventSource.addEventListener('connected', (e: MessageEvent) => {
        connected.value = true
        connectionType.value = 'sse'
        sseErrorCount = 0
        if (e.lastEventId) lastEventId.value = Number(e.lastEventId)
      })

      eventSource.addEventListener('inbox_update', (e: MessageEvent) => {
        if (e.lastEventId) lastEventId.value = Number(e.lastEventId)
        try {
          const data: InboxRealtimeEvent = JSON.parse(e.data)
          onEvent?.(data)
          onRefresh?.()
        } catch { /* ignore malformed event */ }
      })

      eventSource.addEventListener('heartbeat', () => { /* keep-alive */ })

      eventSource.onerror = () => {
        connected.value = false
        // Let the browser auto-retry a transient drop; only settle into polling on a real failure.
        if (eventSource?.readyState === EventSource.CONNECTING && sseErrorCount < MAX_SSE_ERRORS) {
          sseErrorCount++
          return
        }
        closeSSE()
        startPolling()
      }
    } catch {
      startPolling()
    }
  }

  function closeSSE() {
    if (eventSource) { eventSource.close(); eventSource = null }
  }

  function startPolling() {
    stopPolling()
    connectionType.value = 'polling'
    connected.value = true // connected in the polling sense
    pollTimer = setInterval(() => onRefresh?.(), pollInterval)
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function connect() {
    if (import.meta.server || !endpoint.value) return
    sseErrorCount = 0
    connectSSE()
  }

  function disconnect() {
    closeSSE()
    stopPolling()
    connected.value = false
    connectionType.value = 'polling'
  }

  // Reconnect when the endpoint changes (e.g. agency switches client).
  watch(endpoint, () => {
    if (!autoConnect) return
    lastEventId.value = 0
    disconnect()
    connect()
  })

  if (autoConnect) onMounted(() => connect())
  onUnmounted(() => disconnect())

  return { connected, connectionType, connect, disconnect }
}
