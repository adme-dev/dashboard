<script setup lang="ts">
import type { SiteIntelligenceDomain, SiteIntelligenceOverviewResponse, SiteIntelligenceRun } from '~/types/site-intelligence'

const props = defineProps<{
  coverage: SiteIntelligenceOverviewResponse['coverage']
  domains: SiteIntelligenceDomain[]
  runs: SiteIntelligenceRun[]
}>()

function laneDomains(lane: 'owned' | 'competitor') {
  return props.domains.filter(domain => domain.lane === lane)
}

function healthyRuns(lane: 'owned' | 'competitor') {
  const ids = new Set(laneDomains(lane).map(domain => domain.id))
  return props.runs.filter(run => ids.has(run.domainId) && ['completed', 'partial'].includes(run.status)).length
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default" aria-labelledby="site-coverage-heading">
    <div class="flex flex-col gap-2 border-b border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Collection boundary
        </p>
        <h2 id="site-coverage-heading" class="mt-1 text-base font-semibold text-highlighted">
          Owned and public-site coverage
        </h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge color="success" variant="subtle">
          {{ coverage.active }} active
        </UBadge>
        <UBadge v-if="coverage.paused" color="neutral" variant="subtle">
          {{ coverage.paused }} paused
        </UBadge>
        <UBadge v-if="coverage.blocked || coverage.failed" color="warning" variant="subtle">
          {{ coverage.blocked + coverage.failed }} need review
        </UBadge>
      </div>
    </div>

    <div class="divide-y divide-default lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0">
      <div class="relative px-4 py-4 sm:px-5">
        <span class="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Client-owned evidence
            </p>
            <p class="mt-1 max-w-xl text-sm text-muted">
              Current site facts can be joined to this client's aggregate audience outcomes.
            </p>
          </div>
          <p class="text-2xl font-semibold tabular-nums text-highlighted">
            {{ laneDomains('owned').length }}
          </p>
        </div>
        <p class="mt-3 text-xs text-muted">
          {{ healthyRuns('owned') }} domains have a completed or partial latest run
        </p>
      </div>

      <div class="relative px-4 py-4 sm:px-5">
        <span class="absolute inset-y-0 left-0 w-1 bg-warning lg:left-auto lg:right-0" aria-hidden="true" />
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Public competitor evidence
            </p>
            <p class="mt-1 max-w-xl text-sm text-muted">
              Comparisons use approved public business facts, offer terms, content, and source links.
            </p>
          </div>
          <p class="text-2xl font-semibold tabular-nums text-highlighted">
            {{ laneDomains('competitor').length }}
          </p>
        </div>
        <p class="mt-3 text-xs text-muted">
          {{ healthyRuns('competitor') }} domains have a completed or partial latest run
        </p>
      </div>
    </div>
  </section>
</template>
