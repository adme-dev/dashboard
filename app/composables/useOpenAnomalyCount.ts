// app/composables/useOpenAnomalyCount.ts
import { useAuthenticatedFetch } from './useAuthenticatedFetch'

/**
 * Count of open critical anomalies for the current tenant.
 * Surfaced as a UBadge in the sidebar.
 *
 * Refresh triggers (no polling — the count only changes during cron / on-demand
 * scan / mutation):
 *   - Initial layout mount
 *   - visibilitychange (tab focus returning)
 *   - Manual refresh() after a status mutation on the page
 */

// Module-scope so multiple composable callers share the same registration.
// Without this, each useOpenAnomalyCount() call would attach another listener
// (the layout calls it, then the page calls it, etc.) and they'd accumulate
// across navigation.
let visListenerInstalled = false

export function useOpenAnomalyCount() {
  const count = useState<number>('open-anomaly-count', () => 0)
  const { fetch: apiFetch } = useAuthenticatedFetch()

  async function refresh() {
    if (!import.meta.client) return
    try {
      const r = await apiFetch<{ count: number }>('/api/ai/anomalies/count/critical-open')
      count.value = r.count
    } catch {
      // Silent — sidebar badge is best-effort.
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      refresh()
      if (!visListenerInstalled) {
        visListenerInstalled = true
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') refresh()
        })
      }
    })
  }

  return { count, refresh }
}
