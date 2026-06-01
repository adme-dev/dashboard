// app/composables/useSocialReporting.ts
// Data composable for the Slice 3 organic reporting dashboard.
import type { Ref } from 'vue'

export interface ReportKpi { value: number; deltaPct: number | null }
export interface ReportOverview {
  range: { from: string; to: string }
  kpis: { posts: ReportKpi; impressions: ReportKpi; reach: ReportKpi; engagements: ReportKpi; clicks: ReportKpi; engagementRate: ReportKpi }
  cadence: Array<{ weekday: number; posts: number; avgEngagements: number }>
  bestContent: Array<{ postId: string; content: string; permalink: string | null; engagements: number; reach: number; engagementRate: number }>
  accountGrowth: Array<{ platform: string; snapshot_date: string; followers: number; reach: number; impressions: number }>
}

export function useSocialReporting(clientId: Ref<string | null>) {
  const overview = ref<ReportOverview | null>(null)
  const posts = ref<any[]>([])
  const ops = ref<any | null>(null)
  const aiSummary = ref<string | null>(null)
  const loading = ref(false)
  const days = ref(30)
  const platform = ref('all')

  function range() {
    const to = new Date()
    const from = new Date(to.getTime() - days.value * 86400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  const query = () => ({ clientId: clientId.value!, ...range(), platform: platform.value })

  async function load() {
    if (!clientId.value) { overview.value = null; posts.value = []; ops.value = null; return }
    loading.value = true
    try {
      const [ov, ps, op] = await Promise.all([
        $fetch<ReportOverview>('/api/agency/social/reporting/overview', { query: query() }),
        $fetch<any[]>('/api/agency/social/reporting/posts', { query: { ...query(), sort: 'engagements', limit: 50 } }),
        $fetch<any>('/api/agency/social/inbox/analytics/overview', { query: { clientId: clientId.value, days: days.value } }).catch(() => null),
      ])
      overview.value = ov; posts.value = ps; ops.value = op
      aiSummary.value = null // re-generated on demand
    } finally {
      loading.value = false
    }
  }

  async function generateSummary(clientName: string) {
    if (!overview.value) return
    const periodLabel = `the last ${days.value} days`
    const r = await $fetch<{ summary: string | null }>('/api/agency/social/reporting/ai-summary', {
      method: 'POST', body: { clientName, periodLabel, kpis: overview.value.kpis },
    })
    aiSummary.value = r.summary
  }

  return { overview, posts, ops, aiSummary, loading, days, platform, load, generateSummary }
}
