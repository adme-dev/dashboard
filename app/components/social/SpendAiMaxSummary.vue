<script setup lang="ts">
import type { GoogleAiMaxReadinessResponse, GoogleAiMaxScanRun } from '~/types'

const props = defineProps<{
  summary: GoogleAiMaxReadinessResponse['summary'] | null
  latestRun: GoogleAiMaxScanRun | null
}>()

const cutoff = new Date('2026-09-01T00:00:00+10:00')
const daysToCutoff = computed(() => Math.max(0, Math.ceil(
  (cutoff.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
)))
const migrationActive = computed(() => Date.now() >= cutoff.getTime())
const coverageLabel = computed(() => props.summary?.coveragePercent == null
  ? 'Coverage not available'
  : `${Math.round(props.summary.coveragePercent)}% coverage`)

const metrics = computed(() => [
  { label: 'Search campaigns', value: props.summary?.eligible ?? '—', tone: 'text-default' },
  { label: 'Affected', value: props.summary?.affected ?? '—', tone: 'text-warning' },
  { label: 'AI Max enabled', value: props.summary?.enabled ?? '—', tone: 'text-success' },
  { label: 'Needs review', value: props.summary?.needsReview ?? '—', tone: 'text-error' },
  { label: 'Unknown', value: props.summary?.unknown ?? '—', tone: 'text-error' },
  { label: 'Material changes', value: props.summary?.changed ?? '—', tone: 'text-default' },
])

function formatTime(value: string | null | undefined) {
  if (!value) return 'Not scanned'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default">
    <div class="flex flex-col gap-4 border-b border-default bg-elevated/30 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 rounded-lg bg-warning/10 p-2 text-warning">
          <UIcon name="i-lucide-calendar-clock" class="size-5" />
        </div>
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Google migration cutoff
          </p>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-lg font-semibold tracking-tight">
              1 September 2026
            </h2>
            <span class="text-sm text-muted">
              {{ migrationActive ? 'Migration active' : `${daysToCutoff} days remaining` }}
            </span>
          </div>
          <p class="mt-1 max-w-2xl text-xs text-muted">
            Automatically created assets and campaign-level broad match move into AI Max. This ledger is observational and makes no Google Ads changes.
          </p>
        </div>
      </div>
      <div class="min-w-52">
        <div class="flex items-center justify-between gap-3 text-xs">
          <span class="font-medium">{{ coverageLabel }}</span>
          <span class="text-muted">{{ formatTime(summary?.lastCompletedScanAt) }}</span>
        </div>
        <UProgress
          class="mt-2"
          :model-value="summary?.coveragePercent ?? 0"
          :color="(summary?.coveragePercent ?? 0) < 100 ? 'warning' : 'success'"
          size="sm"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 divide-x divide-y divide-default sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      <div v-for="metric in metrics" :key="metric.label" class="px-4 py-3">
        <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
          {{ metric.label }}
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums" :class="metric.tone">
          {{ metric.value }}
        </p>
      </div>
    </div>

    <div
      v-if="latestRun && ['queued', 'running'].includes(latestRun.status)"
      class="flex items-center gap-2 border-t border-default px-4 py-2 text-xs text-muted"
      role="status"
    >
      <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
      Scan {{ latestRun.status }} · {{ latestRun.processedConnections }}/{{ latestRun.totalConnections }} accounts processed
    </div>
  </section>
</template>
