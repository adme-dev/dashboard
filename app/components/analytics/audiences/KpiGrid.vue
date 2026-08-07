<script setup lang="ts">
import type { AudienceKpis } from '~/types/audience-analytics'
import { formatAudienceDelta, formatAudienceMetric } from '~/utils/audienceAnalytics'

const props = defineProps<{
  current: AudienceKpis
  previous: AudienceKpis
}>()

const metrics: Array<{ key: keyof AudienceKpis, label: string, help: string }> = [
  { key: 'visitors', label: 'Visitors', help: 'Distinct first-party visitors in this window' },
  { key: 'sessions', label: 'Sessions', help: 'Recorded website sessions' },
  { key: 'pageViews', label: 'Page views', help: 'Tracked page-view events across all sessions' },
  { key: 'engagedSessions', label: 'Engaged sessions', help: 'Sessions meeting the engagement threshold' },
  { key: 'engagementRate', label: 'Engagement rate', help: 'Sessions meeting the engagement threshold' },
  { key: 'repeatVisitors', label: 'Repeat visitors', help: 'Visitors observed across multiple sessions' },
  { key: 'leadActions', label: 'Lead actions', help: 'Tracked high-intent website actions' },
  { key: 'confirmedLeads', label: 'Confirmed leads', help: 'Lead outcomes linked to website activity' },
  { key: 'visitorToLeadRate', label: 'Visitor to lead', help: 'Confirmed leads as a share of visitors' },
  { key: 'attributionCoverage', label: 'Attribution coverage', help: 'Confirmed leads with attributable website context' }
]

function trendIcon(key: keyof AudienceKpis): string {
  const current = props.current[key]
  const previous = props.previous[key]
  if (current === previous) return 'i-lucide-minus'
  return current > previous ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'
}
</script>

<template>
  <section aria-labelledby="audience-kpis-heading">
    <div class="mb-3 flex items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Audience ledger
        </p>
        <h2 id="audience-kpis-heading" class="mt-1 text-base font-semibold text-highlighted">
          Current window
        </h2>
      </div>
      <p class="hidden text-xs text-muted sm:block">
        Compared with the preceding equal-length window
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <UCard v-for="metric in metrics" :key="metric.key" :ui="{ body: 'p-4' }">
        <div class="flex items-start justify-between gap-2">
          <p class="text-xs font-medium text-muted">
            {{ metric.label }}
          </p>
          <UTooltip :text="metric.help">
            <UIcon name="i-lucide-info" class="size-3.5 text-dimmed" />
          </UTooltip>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-highlighted">
          {{ formatAudienceMetric(metric.key, current[metric.key]) }}
        </p>
        <div class="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="trendIcon(metric.key)" class="size-3.5" />
          <span>{{ formatAudienceDelta(current[metric.key], previous[metric.key]) }}</span>
          <span class="sr-only">from {{ formatAudienceMetric(metric.key, previous[metric.key]) }}</span>
        </div>
      </UCard>
    </div>
  </section>
</template>
