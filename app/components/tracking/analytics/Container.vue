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
</script>

<template>
  <div class="space-y-6">
    <TrackingAnalyticsDateRange v-model:from="from" v-model:to="to" />
    <TrackingAnalyticsKpis :data="summary" :pending="summaryPending" />
    <!-- traffic chart, breakdowns, intent, funnel injected in Task A11 -->
    <slot name="panels" :base="base" :query="q" />
  </div>
</template>
