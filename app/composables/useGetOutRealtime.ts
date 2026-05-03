/**
 * Get Out Realtime Composable
 *
 * Provides live cashflow tracking with multiple connection strategies:
 *   1. SSE stream for near real-time updates (primary)
 *   2. Polling fallback every 30 seconds (reliable everywhere)
 *   3. Manual refresh via refresh() function
 *
 * Usage:
 *   const { data, pending, lastUpdated, isLive, refresh } = useGetOutRealtime()
 */

export interface GetOutData {
  period: {
    year: number
    month: number
    monthName: string
    dayOfMonth: number
    daysInMonth: number
  }
  // New shape: editable line items grouped by category. The settings
  // modal writes to this same shape via PUT /api/xero/get-out/config.
  config: {
    lines: Array<{
      id: string
      label: string
      category: 'wages' | 'expenses' | 'extras'
      amountCents: number
      notes?: string | null
    }>
  }
  wages: number
  expenses: {
    estimated: number
    extras: { detail: any; total: number }
    totalIncExtras: number
  }
  getOutTarget: number
  currentMonth: {
    invoicedTotal: number
    invoicedCount: number
    paceProjection: number
  }
  difference: number
  status: 'surplus' | 'shortfall'
  categoryBreakdown: Array<{ code: string; name: string; total: number; count: number }>
  updatedAt: string
}

export function useGetOutRealtime() {
  const data = ref<GetOutData | null>(null)
  const pending = ref(false)
  const error = ref<Error | null>(null)
  const lastUpdated = ref<Date | null>(null)
  const isLive = ref(false)
  const eventSource = ref<EventSource | null>(null)

  // Polling config
  const POLL_INTERVAL = 30000 // 30 seconds
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function refresh() {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      const result = await $fetch<GetOutData>('/api/xero/get-out')
      data.value = result
      lastUpdated.value = new Date()
    } catch (e: any) {
      error.value = e
      console.error('[GetOut] Refresh failed:', e)
    } finally {
      pending.value = false
    }
  }

  function startPolling() {
    stopPolling()
    isLive.value = true
    pollTimer = setInterval(() => {
      refresh()
    }, POLL_INTERVAL)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    isLive.value = false
  }

  function connectSSE() {
    if (import.meta.server) return
    if (eventSource.value) return

    try {
      const es = new EventSource('/api/xero/get-out/stream')

      es.addEventListener('connected', () => {
        isLive.value = true
        console.log('[GetOut] SSE connected')
      })

      es.addEventListener('refresh', () => {
        // Server detected invoice changes — fetch full data
        refresh()
      })

      es.addEventListener('heartbeat', () => {
        // Connection alive
      })

      es.onerror = () => {
        isLive.value = false
        eventSource.value = null
        // Fall back to polling
        startPolling()
      }

      eventSource.value = es
    } catch {
      // SSE not available — use polling
      startPolling()
    }
  }

  function disconnectSSE() {
    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
    }
  }

  function connect() {
    if (import.meta.server) return
    // Try SSE first, fallback to polling
    connectSSE()
  }

  function disconnect() {
    disconnectSSE()
    stopPolling()
  }

  // Auto-connect on mount
  onMounted(() => {
    refresh() // Initial load
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    data,
    pending,
    error,
    lastUpdated,
    isLive,
    refresh,
    connect,
    disconnect,
  }
}
