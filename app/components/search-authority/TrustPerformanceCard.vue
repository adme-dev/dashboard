<script setup lang="ts">
import type { SearchAuthorityPerformanceEvidence, SearchAuthorityPerformanceMetric } from '~/types'

const props = defineProps<{
  evidence: SearchAuthorityPerformanceEvidence[]
  loading?: boolean
  refreshing?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

const latest = computed(() => [...props.evidence].sort((a, b) => (
  (b.providerAt ?? b.observedAt).localeCompare(a.providerAt ?? a.observedAt)
))[0] ?? null)

const metricRows = computed(() => [
  { key: 'lcp' as const, label: 'LCP', unit: 'ms' },
  { key: 'inp' as const, label: 'INP', unit: 'ms' },
  { key: 'cls' as const, label: 'CLS', unit: 'score' }
])

function display(metric: SearchAuthorityPerformanceMetric): string {
  if (metric.value === null) return 'Unavailable'
  if (metric.unit === 'ms') return `${Math.round(metric.value).toLocaleString('en-AU')} ms`
  return metric.value.toFixed(2)
}

function badgeColor(rating: SearchAuthorityPerformanceMetric['rating']) {
  if (rating === 'good') return 'success'
  if (rating === 'needs_improvement') return 'warning'
  if (rating === 'poor') return 'error'
  return 'neutral'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Mobile performance evidence
          </h2>
          <p class="mt-1 text-sm text-muted">
            CrUX field data and Lighthouse lab tests are kept separate.
          </p>
        </div>
        <UButton
          label="Run mobile check"
          icon="i-lucide-gauge"
          size="sm"
          color="neutral"
          variant="soft"
          :loading="refreshing"
          @click="emit('refresh')"
        />
      </div>
    </template>

    <div v-if="loading" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <USkeleton v-for="index in 3" :key="index" class="h-20" />
    </div>
    <UAlert
      v-else-if="!latest"
      title="Performance evidence unavailable"
      description="Run a mobile check after the owned-site crawl has collected pages. Missing provider data is never shown as zero or passing."
      icon="i-lucide-circle-help"
      color="neutral"
      variant="subtle"
    />
    <div v-else class="space-y-4">
      <div class="grid grid-cols-[minmax(4rem,0.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>Metric</span><span>Field · CrUX</span><span>Lab · Lighthouse</span>
      </div>
      <div
        v-for="row in metricRows"
        :key="row.key"
        class="grid grid-cols-[minmax(4rem,0.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-t border-default pt-3"
      >
        <span class="font-medium text-highlighted">{{ row.label }}</span>
        <UBadge
          :label="display(latest.field[row.key])"
          :color="badgeColor(latest.field[row.key].rating)"
          variant="subtle"
          class="w-fit"
        />
        <UBadge
          :label="display(latest.lab[row.key])"
          :color="badgeColor(latest.lab[row.key].rating)"
          variant="subtle"
          class="w-fit"
        />
      </div>
      <p class="text-xs text-muted">
        {{ latest.providerAt ? `Provider observation: ${new Date(latest.providerAt).toLocaleString('en-AU')}` : `Unavailable: ${latest.reasonCode || 'insufficient provider evidence'}` }}
      </p>
    </div>
  </UCard>
</template>
