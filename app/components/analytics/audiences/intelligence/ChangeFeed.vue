<script setup lang="ts">
import type { SiteIntelligenceChange } from '~/types/site-intelligence'

defineProps<{
  rows: SiteIntelligenceChange[]
  loading?: boolean
}>()

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not present'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
</script>

<template>
  <UCard>
    <div class="mb-4">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        Material history
      </p>
      <h2 class="mt-1 text-base font-semibold text-highlighted">
        Change feed
      </h2>
      <p class="mt-1 text-sm text-muted">
        Expand a change to inspect the structured before-and-after evidence.
      </p>
    </div>

    <div
      v-if="loading && !rows.length"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading changes"
    >
      <USkeleton v-for="index in 3" :key="index" class="h-16 w-full rounded-lg" />
    </div>

    <div v-else-if="rows.length" class="space-y-2">
      <UAccordion
        v-for="change in rows"
        :key="change.id"
        :items="[{ label: `${change.lane === 'owned' ? 'Owned' : 'Competitor'} · ${change.factDiff.changedFields.join(', ')}`, slot: 'evidence' }]"
        variant="soft"
      >
        <template #evidence>
          <div class="space-y-4 pb-3 pt-1">
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{{ dateFormatter.format(new Date(change.observedAt)) }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ Math.round(change.confidence * 100) }}% confidence</span>
              <a
                :href="change.sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                View source
                <UIcon name="i-lucide-external-link" class="size-3" />
              </a>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="rounded-lg border border-default bg-elevated p-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                  Before
                </p>
                <dl class="mt-2 space-y-2">
                  <div v-for="field in change.factDiff.changedFields" :key="`before-${field}`">
                    <dt class="text-xs text-muted">
                      {{ field }}
                    </dt>
                    <dd class="break-words text-sm text-highlighted">
                      {{ displayValue(change.factDiff.before[field]) }}
                    </dd>
                  </div>
                </dl>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                  After
                </p>
                <dl class="mt-2 space-y-2">
                  <div v-for="field in change.factDiff.changedFields" :key="`after-${field}`">
                    <dt class="text-xs text-muted">
                      {{ field }}
                    </dt>
                    <dd class="break-words text-sm text-highlighted">
                      {{ displayValue(change.factDiff.after[field]) }}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </template>
      </UAccordion>
    </div>

    <div v-else class="py-8 text-center" role="status">
      <p class="text-sm font-medium text-highlighted">
        No material changes observed
      </p>
      <p class="mt-1 text-sm text-muted">
        Navigation and cosmetic page noise are excluded from this feed.
      </p>
    </div>
  </UCard>
</template>
