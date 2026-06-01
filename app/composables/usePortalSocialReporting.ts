// app/composables/usePortalSocialReporting.ts
// Client-portal reporting composable (Slice 3 / 3b-2). Session-scoped: never passes a clientId —
// the portal API derives the tenant from the client session cookie.
import type { ReportOverview } from '~/composables/useSocialReporting'

export function usePortalSocialReporting() {
  const overview = ref<ReportOverview | null>(null)
  const aiSummary = ref<string | null>(null)
  const loading = ref(false)
  const days = ref(30)
  const platform = ref('all')

  function query() {
    const to = new Date()
    const from = new Date(to.getTime() - days.value * 86400_000)
    return { from: from.toISOString(), to: to.toISOString(), platform: platform.value }
  }

  async function load() {
    loading.value = true
    try {
      overview.value = await $fetch<ReportOverview>('/api/client-portal/social/reporting/overview', { query: query() })
      aiSummary.value = null
    } finally {
      loading.value = false
    }
  }

  async function generateSummary() {
    if (!overview.value) return
    const r = await $fetch<{ summary: string | null }>('/api/client-portal/social/reporting/ai-summary', {
      method: 'POST', body: { periodLabel: `the last ${days.value} days`, kpis: overview.value.kpis },
    })
    aiSummary.value = r.summary
  }

  return { overview, aiSummary, loading, days, platform, load, generateSummary }
}
