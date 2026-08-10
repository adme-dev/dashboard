<script setup lang="ts">
import type { CrmSearchHealthView } from '~/types/crmSearchOperations'

defineProps<{ health: CrmSearchHealthView | null, pending: boolean, error: string | null }>()
defineEmits<{ refresh: [] }>()

const formatAge = (seconds: number | null) => seconds == null ? 'No pending work' : `${Math.round(seconds / 60)} min`
const alertCopy: Record<string, string> = {
  keyword_error_rate: 'Keyword error rate is at or above 1 %. Investigate before relying on fallback behavior.',
  queue_age: 'Oldest queued operation is at or above 15 minutes. Check durable transport processing.',
  retryable_operations: 'Ordinary retryable work is visible for dashboard review; no page is sent.'
}
</script>

<template>
  <section class="space-y-3" aria-labelledby="crm-search-health-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="crm-search-health-title" class="text-base font-semibold text-highlighted">Search health</h2><p class="text-sm text-muted">Bounded capacity, freshness, dependencies, and cost signals.</p></div>
      <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="pending" @click="$emit('refresh')">Refresh</UButton>
    </div>
    <div v-if="pending && !health" class="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading CRM search health"><USkeleton v-for="item in 3" :key="item" class="h-24 w-full" /></div>
    <UAlert v-else-if="error && !health" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Search health unavailable" :description="error"><template #actions><UButton size="xs" color="error" variant="soft" @click="$emit('refresh')">Try again</UButton></template></UAlert>
    <template v-else-if="health">
      <UAlert v-if="health.capacity.blockNewIndexing" color="error" variant="soft" icon="i-lucide-octagon-alert" title="Block new indexing" description="Capacity is at or above the 90 % block threshold. Existing deletion and recovery work remains visible." />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UCard><p class="text-xs font-medium text-muted">Global control</p><p class="mt-1 text-lg font-semibold text-highlighted">{{ health.global.state }}</p><p class="text-xs text-muted">{{ health.global.maximumMode }} maximum · indexing {{ health.global.indexingReady ? 'ready' : 'not ready' }} · revision {{ health.global.revision }}</p></UCard>
        <UCard><p class="text-xs font-medium text-muted">Capacity</p><p class="mt-1 text-lg font-semibold text-highlighted">{{ (health.capacity.usedBasisPoints / 100).toFixed(1) }} %</p><p class="text-xs text-muted">Warn 60 % · Page 80 % · Block 90 %</p></UCard>
        <UCard><p class="text-xs font-medium text-muted">Oldest operation</p><p class="mt-1 text-lg font-semibold text-highlighted">{{ formatAge(health.oldestAgeSeconds.operation) }}</p><p class="text-xs text-muted">{{ health.counts.retryable }} retryable · dashboard only</p></UCard>
        <UCard><p class="text-xs font-medium text-muted">Budget</p><p class="mt-1 text-lg font-semibold text-highlighted">{{ health.cost.budgetState === 'disabled' ? 'Budget disabled' : `${(health.cost.globalBudgetUsedBasisPoints / 100).toFixed(1)} %` }}</p><p class="text-xs text-muted">{{ health.cost.clientsNearBudget }} clients near ceiling</p></UCard>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium text-muted">Dependencies</span>
        <UBadge v-for="item in health.dependency" :key="item.name" :color="item.status === 'ok' ? 'success' : item.status === 'degraded' ? 'warning' : 'error'" variant="subtle">{{ item.name }} · {{ item.status }}</UBadge>
        <span class="text-xs text-muted">{{ health.freshness.staleClients }} stale clients · queue {{ formatAge(health.oldestAgeSeconds.queue) }} · {{ health.security.crossScopeCandidateRejections }} cross-scope rejections</span>
      </div>
      <div v-if="health.alerts.length" class="space-y-2">
        <UAlert v-for="item in health.alerts" :key="item.signal" :color="item.action === 'alert' ? 'warning' : 'neutral'" variant="soft" :title="item.signal.replaceAll('_', ' ')" :description="alertCopy[item.signal] ?? 'Review this bounded operational signal.'" />
      </div>
    </template>
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No health data" description="No CRM search operational record is available for this organization." />
  </section>
</template>
