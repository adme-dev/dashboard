<script setup lang="ts">
const props = defineProps<{ clientId: string }>()
const from = ref(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10))
const to = ref(new Date().toISOString().slice(0, 10))
const q = computed(() => ({ from: from.value, to: to.value }))

const base = computed(() => `/api/agency/tracking/analytics/${props.clientId}`)

const { data: summary, pending: summaryPending } = await useFetch<Record<string, number>>(
  () => `${base.value}/summary`,
  { query: q }
)
const { data: ts } = await useFetch<{ points: { day: string, visitors: number, events: number }[] }>(
  () => `${base.value}/timeseries`,
  { query: q }
)
const { data: funnel } = await useFetch<{ steps: { step: string, sessions: number, rate: number }[] }>(
  () => `${base.value}/funnel`,
  { query: q }
)
const { data: pages } = await useFetch<{ rows: { key: string, count: number }[] }>(
  () => `${base.value}/breakdown`,
  { query: computed(() => ({ ...q.value, dimension: 'page' })) }
)
const { data: sources } = await useFetch<{ rows: { key: string, count: number }[] }>(
  () => `${base.value}/breakdown`,
  { query: computed(() => ({ ...q.value, dimension: 'source' })) }
)
const { data: devices } = await useFetch<{ rows: { key: string, count: number }[] }>(
  () => `${base.value}/breakdown`,
  { query: computed(() => ({ ...q.value, dimension: 'device' })) }
)
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
