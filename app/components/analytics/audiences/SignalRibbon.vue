<script setup lang="ts">
import type { AudienceOverviewResponse, AudienceSiteRow } from '~/types/audience-analytics'
import { formatFreshness, siteStatusMeta } from '~/utils/audienceAnalytics'

const props = defineProps<{
  coverage: AudienceOverviewResponse['coverage']
}>()

const selectedSiteId = ref<string | null>(null)
const selectedSite = computed<AudienceSiteRow | null>(() => (
  props.coverage.sites.find(site => site.id === selectedSiteId.value) ?? null
))

const summary = computed(() => [
  { label: 'receiving', value: props.coverage.receiving, color: 'text-success' },
  { label: 'stale', value: props.coverage.stale, color: 'text-warning' },
  { label: 'no recent data', value: props.coverage.noRecentData, color: 'text-error' },
  { label: 'never received', value: props.coverage.neverReceived, color: 'text-muted' },
  { label: 'inactive', value: props.coverage.inactive, color: 'text-muted' }
])

function selectSite(site: AudienceSiteRow) {
  selectedSiteId.value = selectedSiteId.value === site.id ? null : site.id
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Tracking coverage
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ coverage.receiving }} of {{ coverage.total }} endpoints are live
          </h2>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span v-for="item in summary" :key="item.label" class="inline-flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-current" :class="item.color" aria-hidden="true" />
            <span class="tabular-nums text-default">{{ item.value }}</span> {{ item.label }}
          </span>
        </div>
      </div>
    </template>

    <div v-if="coverage.sites.length" class="overflow-x-auto pb-1">
      <div class="flex min-w-max items-center gap-1.5" role="list" aria-label="Tracking endpoint signals">
        <UTooltip
          v-for="site in coverage.sites"
          :key="site.id"
          :text="`${site.clientName} · ${site.name} · ${siteStatusMeta(site.status).label}`"
        >
          <UButton
            :aria-label="`Inspect ${site.name}: ${siteStatusMeta(site.status).label}`"
            :aria-pressed="selectedSiteId === site.id"
            color="neutral"
            variant="ghost"
            square
            size="xs"
            class="group rounded-full p-1 focus-visible:ring-2 focus-visible:ring-primary"
            @click="selectSite(site)"
          >
            <span
              class="block size-3 rounded-full ring-2 ring-inset ring-current transition-transform motion-reduce:transition-none group-hover:scale-110"
              :class="{
                'bg-success/35 text-success': site.status === 'receiving',
                'bg-warning/35 text-warning': site.status === 'stale',
                'bg-error/35 text-error': site.status === 'no_recent_data',
                'bg-muted text-muted': site.status === 'never_received' || site.status === 'inactive'
              }"
              aria-hidden="true"
            />
          </UButton>
        </UTooltip>
      </div>
    </div>

    <div v-else class="rounded-lg border border-dashed border-default px-4 py-8 text-center">
      <UIcon name="i-lucide-radio-tower" class="mx-auto size-6 text-muted" />
      <p class="mt-2 text-sm font-medium">
        No tracking endpoints in this scope
      </p>
      <p class="mt-1 text-sm text-muted">
        Choose another client or provision a site endpoint.
      </p>
    </div>

    <div
      v-if="selectedSite"
      class="grid grid-cols-1 gap-3 rounded-lg border border-default bg-elevated/50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <p class="truncate text-sm font-semibold text-highlighted">
            {{ selectedSite.clientName }} · {{ selectedSite.name }}
          </p>
          <UBadge :color="siteStatusMeta(selectedSite.status).color" variant="soft">
            {{ siteStatusMeta(selectedSite.status).label }}
          </UBadge>
        </div>
        <p class="mt-1 text-xs text-muted">
          {{ selectedSite.origin || 'Origin not recorded' }} · {{ formatFreshness(selectedSite.lastEventAt) }} ·
          <span class="tabular-nums">{{ selectedSite.eventsInWindow.toLocaleString('en-AU') }}</span> events in window
        </p>
      </div>
      <UButton
        :to="`/agency/tracking/${selectedSite.clientId}`"
        label="Open diagnostics"
        icon="i-lucide-arrow-up-right"
        trailing
        color="neutral"
        variant="soft"
        size="sm"
      />
    </div>
  </UCard>
</template>
