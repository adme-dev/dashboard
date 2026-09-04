<script setup lang="ts">
import { computed } from 'vue'

interface SignalSummary {
  captured: number
  confirmed: number
  consentGranted: number
  policySkipped: number
  delivered: number
  retrying: number
  failed: number
  identifierCoverage: Record<string, number>
  freshnessAt: string | null
}

const props = defineProps<{
  summary: SignalSummary | null
  pending: boolean
  error: string | null
}>()

defineEmits<{ retry: [] }>()

const primaryMetrics = computed(() => [
  {
    label: 'Captured signals',
    value: props.summary?.captured ?? 0,
    help: 'First-party browser events received',
    icon: 'i-lucide-radio-tower'
  },
  {
    label: 'Confirmed conversions',
    value: props.summary?.confirmed ?? 0,
    help: 'Canonical events accepted by XeroFlow',
    icon: 'i-lucide-badge-check'
  },
  {
    label: 'Delivered',
    value: props.summary?.delivered ?? 0,
    help: 'Provider-accepted or completed deliveries',
    icon: 'i-lucide-send'
  }
])

const coverageLabels: Record<string, string> = {
  ttclid: 'TikTok click',
  ttp: 'TikTok browser',
  fbc: 'Meta click',
  fbp: 'Meta browser',
  gclid: 'Google click',
  gbraid: 'Google app/web',
  wbraid: 'Google web/app'
}

const identifierCoverage = computed(() => Object.entries(props.summary?.identifierCoverage ?? {})
  .map(([key, value]) => ({
    key,
    label: coverageLabels[key] ?? key,
    value,
    percentage: props.summary?.captured
      ? Math.min(100, Math.round((value / props.summary.captured) * 100))
      : 0
  })))

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-AU').format(value)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No signals recorded yet'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs" data-testid="measurement-signal-overview">
    <header class="flex flex-col gap-3 border-b border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <div class="flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-activity" class="size-4" />
          </span>
          <div>
            <h2 class="font-semibold text-highlighted">
              Signal health
            </h2>
            <p class="text-sm text-muted">
              Collection, policy and delivery evidence across active destinations.
            </p>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-clock-3" class="size-3.5" />
        Updated {{ formatDateTime(summary?.freshnessAt) }}
      </div>
    </header>

    <div v-if="pending" class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 sm:p-6" aria-busy="true" aria-label="Loading signal health">
      <div v-for="index in 3" :key="index" class="h-28 animate-pulse rounded-lg bg-elevated" />
    </div>

    <div v-else-if="error" class="p-5 sm:p-6">
      <div role="alert" class="flex flex-col gap-4 rounded-lg border border-error/30 bg-error/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-medium text-error">
            Signal health is unavailable
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ error }}
          </p>
        </div>
        <UButton label="Try again" icon="i-lucide-refresh-cw" color="neutral" variant="outline" @click="$emit('retry')" />
      </div>
    </div>

    <div v-else-if="summary" class="p-5 sm:p-6">
      <div class="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-default bg-default sm:grid-cols-3">
        <div v-for="metric in primaryMetrics" :key="metric.label" class="bg-elevated/40 p-4 sm:p-5">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
              {{ metric.label }}
            </p>
            <UIcon :name="metric.icon" class="size-4 text-primary" />
          </div>
          <p class="mt-3 text-2xl font-semibold tabular-nums text-highlighted">
            {{ formatNumber(metric.value) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ metric.help }}
          </p>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div>
          <div class="flex items-end justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Match identifier coverage
              </h3>
              <p class="mt-1 text-xs text-muted">
                Aggregate counts only; raw click and browser identifiers never appear here.
              </p>
            </div>
            <UBadge color="neutral" variant="outline">
              {{ formatNumber(summary.captured) }} captured
            </UBadge>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <div v-for="identifier in identifierCoverage" :key="identifier.key">
              <div class="flex items-center justify-between gap-3 text-xs">
                <span class="font-medium text-highlighted">{{ identifier.label }}</span>
                <span class="tabular-nums text-muted">{{ formatNumber(identifier.value) }} · {{ identifier.percentage }}%</span>
              </div>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                <div class="h-full rounded-full bg-primary" :style="{ width: `${identifier.percentage}%` }" />
              </div>
            </div>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-3 rounded-lg border border-default bg-elevated/30 p-4">
          <div>
            <dt class="text-xs text-muted">Consent granted</dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums text-highlighted">{{ formatNumber(summary.consentGranted) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Policy skipped</dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums text-highlighted">{{ formatNumber(summary.policySkipped) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Retrying</dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums text-warning">{{ formatNumber(summary.retrying) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Failed</dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums text-error">{{ formatNumber(summary.failed) }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
