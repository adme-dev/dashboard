<script setup lang="ts">
const props = defineProps<{ clientId: string }>()
const from = ref(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10))
const to = ref(new Date().toISOString().slice(0, 10))
const q = computed(() => ({ from: from.value, to: to.value }))

const base = computed(() => `/api/agency/tracking/analytics/${props.clientId}`)

type TimeseriesResponse = { points: { day: string, visitors: number, events: number }[] }
type FunnelResponse = { steps: { step: string, sessions: number, rate: number }[] }
type BreakdownResponse = { rows: { key: string, count: number }[] }

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const summary = ref<Record<string, number> | null>(null)
const ts = ref<TimeseriesResponse | null>(null)
const funnel = ref<FunnelResponse | null>(null)
const pages = ref<BreakdownResponse | null>(null)
const sources = ref<BreakdownResponse | null>(null)
const devices = ref<BreakdownResponse | null>(null)
const summaryPending = ref(false)

async function refreshAll() {
  summaryPending.value = true
  try {
    const [nextSummary, nextTimeseries, nextFunnel, nextPages, nextSources, nextDevices] = await Promise.all([
      apiFetch<Record<string, number>>(`${base.value}/summary`, { query: q.value }),
      apiFetch<TimeseriesResponse>(`${base.value}/timeseries`, { query: q.value }),
      apiFetch<FunnelResponse>(`${base.value}/funnel`, { query: q.value }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'page' } }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'source' } }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'device' } })
    ])
    summary.value = nextSummary
    ts.value = nextTimeseries
    funnel.value = nextFunnel
    pages.value = nextPages
    sources.value = nextSources
    devices.value = nextDevices
  } catch {
    summary.value = null
    ts.value = null
    funnel.value = null
    pages.value = null
    sources.value = null
    devices.value = null
  } finally {
    summaryPending.value = false
  }
}

await refreshAll()
watch([base, q], () => {
  void refreshAll()
})
</script>

<template>
  <div class="space-y-6">
    <TrackingAnalyticsDateRange v-model:from="from" v-model:to="to" />
    <TrackingAnalyticsKpis :data="summary" :pending="summaryPending" />
    <TrackingAnalyticsTrafficChart :points="ts?.points ?? []" />
    <TrackingAnalyticsIntent
      :call-clicks="summary?.callClicks ?? 0"
      :form-submits="summary?.formSubmits ?? 0"
    />
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <TrackingAnalyticsBreakdownTable title="Top pages" :rows="pages?.rows ?? []" />
      <TrackingAnalyticsBreakdownTable title="Top sources" :rows="sources?.rows ?? []" />
      <TrackingAnalyticsBreakdownTable title="Devices" :rows="devices?.rows ?? []" />
    </div>
    <TrackingAnalyticsFunnel :steps="funnel?.steps ?? []" />
  </div>
</template>
