// app/composables/useLeadsStream.ts
// Wraps EventSource for /api/leads/stream. Auto-reconnects with backoff.
// Exposes a reactive list of recent lead-id pings the page can react to.

import { ref, onMounted, onBeforeUnmount } from 'vue'

export interface LeadsStreamEvent {
  id: string
  submitted_at: string
  client_id: string | null
  source: string
}

export function useLeadsStream() {
  const events = ref<LeadsStreamEvent[]>([])
  const connected = ref(false)
  let es: EventSource | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function close() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (es) { es.close(); es = null }
    connected.value = false
  }

  function open() {
    close()
    es = new EventSource('/api/leads/stream', { withCredentials: true })
    es.addEventListener('hello', () => { connected.value = true; retry = 0 })
    es.addEventListener('lead', (e: any) => {
      try {
        const ev = JSON.parse(e.data) as LeadsStreamEvent
        events.value = [ev, ...events.value].slice(0, 50)
      } catch {}
    })
    es.addEventListener('ping', () => {})
    es.onerror = () => {
      connected.value = false
      es?.close(); es = null
      retry++
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5))
      retryTimer = setTimeout(open, delay)
    }
  }

  onMounted(open)
  onBeforeUnmount(close)

  return { events, connected, reopen: open, close }
}
