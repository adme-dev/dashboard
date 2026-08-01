<script setup lang="ts">
import type { AudienceOpportunity } from '~/types/audience-analytics'
import { opportunityTone } from '~/utils/audienceAnalytics'

defineProps<{
  opportunities: AudienceOpportunity[]
}>()

function evidenceRows(opportunity: AudienceOpportunity) {
  return Object.entries(opportunity.evidence)
}

function thresholdRows(opportunity: AudienceOpportunity) {
  return Object.entries(opportunity.thresholds)
}

function labelFor(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, letter => letter.toUpperCase())
}
</script>

<template>
  <section aria-labelledby="audience-opportunities-heading">
    <div class="mb-3">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Deterministic signals</p>
      <h2 id="audience-opportunities-heading" class="mt-1 text-base font-semibold text-highlighted">
        Audience opportunities
      </h2>
    </div>

    <div v-if="opportunities.length" class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <UCard v-for="opportunity in opportunities" :key="opportunity.code">
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">{{ opportunity.title }}</h3>
              <p class="mt-1 text-sm text-muted">{{ opportunity.description }}</p>
            </div>
            <UBadge :color="opportunityTone(opportunity.status).color" variant="soft">
              {{ opportunityTone(opportunity.status).label }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3">
          <div>
            <p class="text-xs text-muted">Audience size</p>
            <p class="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-highlighted">
              {{ opportunity.count.toLocaleString('en-AU') }}
            </p>
          </div>
          <p v-if="opportunity.status === 'insufficient_data'" class="self-center text-xs text-muted">
            More events are needed before this pattern can be treated as a reliable opportunity.
          </p>
          <div v-else class="self-center text-xs text-muted">
            This is an evidence-led recommendation. No audience or campaign has been changed.
          </div>
        </div>

        <template #footer>
          <div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div>
              <p class="font-medium text-default">Evidence</p>
              <dl class="mt-1 space-y-1 text-muted">
                <div v-for="entry in evidenceRows(opportunity)" :key="entry[0]" class="flex justify-between gap-3">
                  <dt>{{ labelFor(entry[0]) }}</dt><dd class="tabular-nums text-default">{{ entry[1] }}</dd>
                </div>
              </dl>
            </div>
            <div>
              <p class="font-medium text-default">Rule thresholds</p>
              <dl class="mt-1 space-y-1 text-muted">
                <div v-for="entry in thresholdRows(opportunity)" :key="entry[0]" class="flex justify-between gap-3">
                  <dt>{{ labelFor(entry[0]) }}</dt><dd class="tabular-nums text-default">{{ entry[1] }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </template>
      </UCard>
    </div>

    <UCard v-else>
      <div class="py-6 text-center">
        <UIcon name="i-lucide-scan-search" class="mx-auto size-6 text-muted" />
        <p class="mt-2 text-sm font-medium">No opportunity rules returned</p>
        <p class="mt-1 text-sm text-muted">Widen the reporting window to build a stronger evidence base.</p>
      </div>
    </UCard>
  </section>
</template>
