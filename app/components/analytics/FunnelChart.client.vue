<!-- app/components/analytics/FunnelChart.client.vue -->
<!-- Gate: shows a pick-a-client prompt for the "all clients" view, and only
     mounts the data component (which fetches) once a client is selected. -->
<script setup lang="ts">
const props = defineProps<{ clientId: string | null, startDate: string, endDate: string }>()
</script>

<template>
  <UCard v-if="!props.clientId">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
      </div>
    </template>
    <div class="flex flex-col items-center gap-2 py-10 text-center">
      <UIcon name="i-lucide-users" class="w-8 h-8 text-muted" />
      <p class="text-sm text-muted">
        Select a client to view its GA4 website funnel.
      </p>
    </div>
  </UCard>

  <AnalyticsFunnelChartData
    v-else
    :client-id="props.clientId"
    :start-date="props.startDate"
    :end-date="props.endDate"
  />
</template>
