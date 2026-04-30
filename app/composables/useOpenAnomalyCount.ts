// app/composables/useOpenAnomalyCount.ts

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
export function useOpenAnomalyCount() {
  const count = useState<number>('open-anomaly-count', () => 0)

  async function refresh() {
    if (!import.meta.client) return
    try {
      const r = await $fetch<{ count: number }>('/api/ai/anomalies/count/critical-open')
      count.value = r.count
    } catch {
      // Silent — sidebar badge is best-effort.
    }
  }

  let visListenerInstalled = false
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
