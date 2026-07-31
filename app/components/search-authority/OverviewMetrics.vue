<script setup lang="ts">
import type { SearchAuthorityOverview } from '~/types'

const props = defineProps<{
  metrics: SearchAuthorityOverview['metrics'] | null
  loading: boolean
}>()

const numberFormatter = new Intl.NumberFormat('en-AU')
const percentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
})

const metricItems = computed(() => {
  const metrics = props.metrics
  if (!metrics) return []
  return [
    {
      label: 'Clicks',
      value: numberFormatter.format(metrics.clicks),
      change: metrics.clickChangePercent
    },
    {
      label: 'Impressions',
      value: numberFormatter.format(metrics.impressions),
      change: metrics.impressionChangePercent
    },
    {
      label: 'Click-through rate',
      value: percentFormatter.format(metrics.ctr),
      change: null
    },
    {
      label: 'Average position',
      value: metrics.position > 0 ? metrics.position.toFixed(1) : '—',
      change: null
    }
  ]
})

function changeLabel(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}% vs prior period`
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="font-semibold text-highlighted">
          Search performance
        </h2>
        <p class="mt-1 text-sm text-muted">
          Literal Search Console measures for the selected window.
        </p>
      </div>
    </template>

    <div
      v-if="loading"
      class="grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-label="Loading search performance"
    >
      <USkeleton v-for="index in 4" :key="index" class="h-20 w-full" />
    </div>

    <div
      v-else-if="metrics"
      class="grid grid-cols-1 divide-y divide-default sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
    >
      <div
        v-for="metric in metricItems"
        :key="metric.label"
        class="px-1 py-4 first:pt-0 sm:px-5 sm:py-1 sm:first:pl-0 sm:last:pr-0"
      >
        <p class="text-sm text-muted">
          {{ metric.label }}
        </p>
        <p class="mt-1 text-2xl font-semibold tracking-tight text-highlighted">
          {{ metric.value }}
        </p>
        <p
          v-if="metric.change !== null"
          class="mt-1 text-xs"
          :class="metric.change >= 0 ? 'text-success' : 'text-error'"
        >
          {{ changeLabel(metric.change) }}
        </p>
      </div>
    </div>

    <UAlert
      v-else
      title="No search evidence yet"
      description="Connect and sync Search Console to populate performance measures."
      icon="i-lucide-chart-no-axes-combined"
      color="neutral"
      variant="subtle"
    />
  </UCard>
</template>
