<script setup lang="ts">
import type { SiteIntelligenceInsight } from '~/types/site-intelligence'

defineProps<{
  insights: SiteIntelligenceInsight[]
  loading?: boolean
}>()

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function displayDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

function confidence(value: number): string {
  return `${Math.round(value * 100)}% confidence`
}
</script>

<template>
  <UCard>
    <div class="mb-4">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        Action queue
      </p>
      <h2 class="mt-1 text-base font-semibold text-highlighted">
        Evidence-backed insights
      </h2>
      <p class="mt-1 text-sm text-muted">
        Deterministic candidates are ranked first; model interpretation is labelled when present.
      </p>
    </div>

    <div
      v-if="loading && !insights.length"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading insights"
    >
      <USkeleton v-for="index in 3" :key="index" class="h-24 w-full rounded-lg" />
    </div>

    <div v-else-if="insights.length" class="divide-y divide-default">
      <article v-for="insight in insights" :key="insight.id" class="py-4 first:pt-0 last:pb-0">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="insight.deterministic ? 'primary' : 'warning'" variant="subtle">
                {{ insight.deterministic ? 'Deterministic' : 'AI interpreted' }}
              </UBadge>
              <UBadge color="neutral" variant="outline">
                {{ confidence(insight.confidence) }}
              </UBadge>
              <span class="text-xs text-muted">{{ displayDate(insight.observedAt) }}</span>
            </div>
            <h3 class="mt-2 text-sm font-semibold text-highlighted">
              {{ insight.title }}
            </h3>
            <p class="mt-1 text-sm leading-6 text-muted">
              {{ insight.summary }}
            </p>
          </div>
          <UBadge color="neutral" variant="soft" class="shrink-0">
            {{ insight.evidencePageIds.length + insight.evidenceChangeIds.length }} evidence
          </UBadge>
        </div>
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <a
            v-for="url in insight.evidenceUrls"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View source
            <UIcon name="i-lucide-external-link" class="size-3" />
          </a>
          <span class="text-xs text-muted">Rule {{ insight.ruleVersion }}</span>
        </div>
      </article>
    </div>

    <div v-else class="py-8 text-center" role="status">
      <UIcon name="i-lucide-badge-check" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm font-medium text-highlighted">
        No material intelligence in this range
      </p>
      <p class="mt-1 text-sm text-muted">
        Collection is healthy, but no rule crossed an evidence threshold.
      </p>
    </div>
  </UCard>
</template>
