<script setup lang="ts">
import type { CrmSearchTelemetryView } from '~/types/crmSearchOperations'

defineProps<{ telemetry: CrmSearchTelemetryView[], pending: boolean, error: string | null }>()
defineEmits<{ refresh: [] }>()
const columns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'mode', header: 'Mode' },
  { accessorKey: 'surface', header: 'Surface' },
  { accessorKey: 'statusClass', header: 'Status' },
  { accessorKey: 'requestCount', header: 'Requests' },
  { accessorKey: 'fallbackCount', header: 'Fallbacks' },
  { accessorKey: 'timeoutCount', header: 'Timeouts' }
]
</script>

<template>
  <section class="space-y-3" aria-labelledby="crm-search-telemetry-title">
    <div class="flex items-center justify-between gap-3"><div><h2 id="crm-search-telemetry-title" class="text-base font-semibold text-highlighted">Search telemetry</h2><p class="text-sm text-muted">Bounded daily aggregates only; no raw queries or record identifiers.</p></div><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="pending" @click="$emit('refresh')">Refresh</UButton></div>
    <div v-if="pending && !telemetry.length" aria-busy="true" aria-label="Loading search telemetry"><USkeleton class="h-32 w-full" /></div>
    <UAlert v-else-if="error && !telemetry.length" color="error" variant="soft" title="Telemetry unavailable" :description="error" />
    <UTable v-else-if="telemetry.length" :data="telemetry" :columns="columns" />
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No telemetry data" description="No bounded CRM search events are available for the last 30 days." />
  </section>
</template>
