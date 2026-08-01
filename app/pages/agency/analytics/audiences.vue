<script setup lang="ts">
import type { AudienceBreakdownDimension, AudienceMetric } from '~/types/audience-analytics'

definePageMeta({
  layout: 'agency',
  middleware: ['role-media']
})

useHead({
  title: 'Website Audiences · XeroFlow Agency'
})

const {
  filters,
  overview,
  timeseries,
  breakdowns,
  status,
  errors,
  updateFilters,
  refreshAll
} = useAudienceAnalytics()

const availableClients = computed(() => overview.value?.availableClients ?? [])
const breakdownPanels: Array<{
  dimension: AudienceBreakdownDimension
  title: string
  description: string
}> = [
  {
    dimension: 'source',
    title: 'Acquisition sources',
    description: 'Where audience volume arrived, paired with engagement and lead quality.'
  },
  {
    dimension: 'campaign',
    title: 'Campaign signals',
    description: 'Tracked campaign labels ranked by outcomes rather than traffic alone.'
  },
  {
    dimension: 'page',
    title: 'Content and landing pages',
    description: 'Pages attracting attention and the lead outcomes observed after arrival.'
  }
]

function breakdownRows(dimension: AudienceBreakdownDimension) {
  return breakdowns.value[dimension]?.rows ?? []
}

function updateMetric(metric: AudienceMetric) {
  updateFilters({ metric })
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto overscroll-y-contain space-y-6 p-4 sm:p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-3xl">
        <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
          <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          First-party signal desk
        </div>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          Website audiences
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Read tracking health, audience quality, lead outcomes, and client opportunities from XeroFlow's aggregate website evidence.
        </p>
      </div>
      <div class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-shield-check" class="size-4 text-success" />
        Aggregate, read-only intelligence
      </div>
    </div>

    <AnalyticsSectionNav active="audiences" />

    <AnalyticsAudiencesFilterBar
      :from="filters.from"
      :to="filters.to"
      :client-id="filters.clientId"
      :available-clients="availableClients"
      @update:from="updateFilters({ from: $event })"
      @update:to="updateFilters({ to: $event })"
      @update:client-id="updateFilters({ clientId: $event })"
    />

    <AnalyticsAudiencesAnalyst
      :from="filters.from"
      :to="filters.to"
      :client-id="filters.clientId"
    />

    <UAlert
      v-if="status.overview === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Audience overview could not be refreshed"
      :description="errors.overview || 'The existing trend and breakdown panels may still be available.'"
    >
      <template #actions>
        <UButton
          label="Retry overview"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshAll"
        />
      </template>
    </UAlert>

    <template v-if="status.overview === 'pending' && !overview">
      <USkeleton class="h-36 w-full rounded-xl" />
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <USkeleton v-for="index in 8" :key="index" class="h-28 w-full rounded-xl" />
      </div>
    </template>

    <template v-if="overview">
      <AnalyticsAudiencesSignalRibbon :coverage="overview.coverage" />
      <AnalyticsAudiencesKpiGrid :current="overview.kpis" :previous="overview.previousKpis" />
    </template>

    <UAlert
      v-if="status.timeseries === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-chart-no-axes-combined"
      title="Audience trend could not be refreshed"
      :description="errors.timeseries || 'Overview and client evidence remain available.'"
    >
      <template #actions>
        <UButton
          label="Retry trend"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshAll"
        />
      </template>
    </UAlert>

    <USkeleton v-if="status.timeseries === 'pending' && !timeseries" class="h-[28rem] w-full rounded-xl" />
    <AnalyticsAudiencesTrendChart
      v-if="timeseries"
      :data="timeseries"
      :metric="filters.metric"
      @update:metric="updateMetric"
    />

    <AnalyticsAudiencesOpportunityGrid v-if="overview" :opportunities="overview.opportunities" />

    <UAlert
      v-if="status.breakdowns === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-list-filter"
      title="Audience breakdowns could not be refreshed"
      :description="errors.breakdowns || 'Overview, trend, and client evidence remain available.'"
    >
      <template #actions>
        <UButton
          label="Retry breakdowns"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshAll"
        />
      </template>
    </UAlert>

    <section aria-labelledby="audience-breakdowns-heading">
      <div class="mb-3">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Ranked evidence
        </p>
        <h2 id="audience-breakdowns-heading" class="mt-1 text-base font-semibold text-highlighted">
          Acquisition and behaviour
        </h2>
      </div>

      <div v-if="status.breakdowns === 'pending' && !Object.keys(breakdowns).length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <USkeleton v-for="index in 3" :key="index" class="h-80 w-full rounded-xl" />
      </div>
      <div v-else-if="Object.keys(breakdowns).length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AnalyticsAudiencesBreakdownPanel
          v-for="panel in breakdownPanels"
          :key="panel.dimension"
          :title="panel.title"
          :description="panel.description"
          :rows="breakdownRows(panel.dimension)"
          class="overflow-x-auto last:xl:col-span-2"
        />
      </div>
    </section>

    <AnalyticsAudiencesClientTable v-if="overview" :clients="overview.clients" class="overflow-x-auto" />
  </div>
</template>
