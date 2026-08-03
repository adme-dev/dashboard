<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { computed, ref, watch } from 'vue'
import type { AiPilotMetricsResponse, AiPilotReleaseMetrics } from '~/types/aiGovernance'

const props = defineProps<{
  data: AiPilotMetricsResponse | null
  window: { from: string, to: string }
  pending: boolean
  error: string | null
}>()
const emit = defineEmits<{
  refresh: []
  applyWindow: [window: { from: string, to: string }]
}>()

function calendarDate(instant: string, subtractDay = false): DateValue {
  const date = new Date(instant)
  if (subtractDay) date.setUTCDate(date.getUTCDate() - 1)
  return parseDate(date.toISOString().slice(0, 10))
}

const fromIsoDate = ref(calendarDate(props.window.from).toString())
const throughIsoDate = ref(calendarDate(props.window.to, true).toString())
const fromDate = computed({
  get: () => parseDate(fromIsoDate.value),
  set: (value: DateValue | undefined) => { if (value) fromIsoDate.value = value.toString() }
})
const throughDate = computed({
  get: () => parseDate(throughIsoDate.value),
  set: (value: DateValue | undefined) => { if (value) throughIsoDate.value = value.toString() }
})

watch(() => props.window, (window) => {
  fromIsoDate.value = calendarDate(window.from).toString()
  throughIsoDate.value = calendarDate(window.to, true).toString()
}, { deep: true })

const windowValid = computed(() => {
  const from = Date.parse(`${fromDate.value.toString()}T00:00:00.000Z`)
  const to = Date.parse(`${throughDate.value.add({ days: 1 }).toString()}T00:00:00.000Z`)
  return from < to && to - from <= 31 * 24 * 60 * 60 * 1_000
})

function applyWindow() {
  if (!windowValid.value) return
  emit('applyWindow', {
    from: `${fromDate.value.toString()}T00:00:00.000Z`,
    to: `${throughDate.value.add({ days: 1 }).toString()}T00:00:00.000Z`
  })
}

const cohortLabels: Record<AiPilotReleaseMetrics['cohort'], string> = {
  account_production: 'Account management & production',
  paid_media: 'Paid media',
  finance_bookkeeping: 'Finance & bookkeeping'
}

function gateLabel(gate: AiPilotReleaseMetrics['gate']) {
  if (gate === 'insufficient_data') return 'Insufficient data'
  return gate === 'pass' ? 'Pass' : 'Fail'
}

function gateColor(gate: AiPilotReleaseMetrics['gate']) {
  if (gate === 'pass') return 'success' as const
  if (gate === 'fail') return 'error' as const
  return 'warning' as const
}

function packLabel(packKey: string) {
  return packKey.replace(/_read_draft$/, '').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase())
}

function blockerLabel(blocker: string) {
  return blocker.replace(/_/g, ' ').replace(/^./, value => value.toUpperCase())
}

function percent(value: number | null) {
  return value === null ? 'No ratings' : `${Math.round(value * 100)}%`
}

function cost(value: number) {
  return `$${(value / 1_000_000).toFixed(4)}`
}
</script>

<template>
  <section aria-labelledby="pilot-evidence-title" class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="pilot-evidence-title" class="text-base font-semibold text-highlighted">Three-cohort pilot evidence</h2>
        <p class="mt-1 max-w-3xl text-sm text-muted">Aggregate release evidence only. This view is not an employee activity report or performance score.</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="pending" @click="emit('refresh')">Refresh pilot evidence</UButton>
    </div>

    <div class="@container rounded-lg border border-default bg-elevated/40 p-3">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-[1fr_1fr_auto] @lg:items-end">
        <UFormField label="Evidence from">
          <UPopover>
            <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
              {{ new Date(`${fromDate.toString()}T00:00:00.000Z`).toLocaleDateString() }}
            </UButton>
            <template #content><UCalendar v-model="fromDate" class="p-2" /></template>
          </UPopover>
        </UFormField>
        <UFormField label="Evidence through">
          <UPopover>
            <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
              {{ new Date(`${throughDate.toString()}T00:00:00.000Z`).toLocaleDateString() }}
            </UButton>
            <template #content><UCalendar v-model="throughDate" class="p-2" /></template>
          </UPopover>
        </UFormField>
        <UButton :disabled="!windowValid" :loading="pending" class="w-full @lg:w-auto" @click="applyWindow">Apply evidence window</UButton>
      </div>
      <p v-if="!windowValid" class="mt-2 text-xs text-error">Choose an inclusive date range of no more than 31 days.</p>
    </div>

    <div v-if="pending && !data" class="space-y-3" aria-busy="true" aria-label="Loading pilot evidence">
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-36 w-full" />
    </div>

    <UAlert v-else-if="error && !data" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Pilot evidence unavailable" :description="error">
      <template #actions><UButton color="error" variant="soft" @click="emit('refresh')">Try again</UButton></template>
    </UAlert>

    <template v-else-if="data">
      <UAlert v-if="error" color="warning" variant="soft" icon="i-lucide-clock-alert" title="Pilot evidence may be stale" :description="error">
        <template #actions><UButton color="warning" variant="soft" @click="emit('refresh')">Retry evidence</UButton></template>
      </UAlert>

      <UAlert
        :color="gateColor(data.summary.gate)"
        variant="soft"
        :icon="data.summary.gate === 'pass' ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
        :title="`Overall pilot gate: ${gateLabel(data.summary.gate)}`"
        :description="`${data.summary.presentReleaseCount} of ${data.summary.requiredPackCount} required releases present.`"
      />

      <div class="flex flex-wrap gap-x-5 gap-y-2 border-y border-default py-3 text-xs text-muted">
        <span><strong class="font-medium text-default">Window</strong> {{ new Date(data.window.from).toLocaleDateString() }}–{{ new Date(data.window.to).toLocaleDateString() }}</span>
        <span><strong class="font-medium text-default">Thresholds</strong> 20 successful tasks required · 80% useful at 10+ ratings</span>
        <span><strong class="font-medium text-default">Budgets</strong> P95 latency and cost per successful task use each exact pack version</span>
      </div>

      <UAlert v-if="!data.metrics.length" color="warning" variant="soft" icon="i-lucide-flask-conical" title="Required pilot evidence is missing" description="The five-pack evidence matrix could not be populated for this window." />

      <div v-else class="divide-y divide-default rounded-lg border border-default bg-default" role="list" aria-live="polite">
        <article v-for="metric in data.metrics" :key="metric.packKey" class="p-4" role="listitem">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">{{ packLabel(metric.packKey) }}</h3>
              <p class="mt-0.5 text-xs text-muted">{{ cohortLabels[metric.cohort] }}</p>
              <p class="mt-1 font-mono text-[11px] text-muted">Release {{ metric.releaseId ?? 'missing' }}</p>
            </div>
            <UBadge :color="gateColor(metric.gate)" variant="soft">{{ gateLabel(metric.gate) }}</UBadge>
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            <div><dt class="text-xs text-muted">Eligible</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ metric.eligibleUsers }}</dd></div>
            <div><dt class="text-xs text-muted">Active</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ metric.activeUsers }}</dd></div>
            <div><dt class="text-xs text-muted">Successful</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ metric.successfulTurns }}</dd></div>
            <div><dt class="text-xs text-muted">Failed / fallback</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ metric.failedTurns }}</dd></div>
            <div><dt class="text-xs text-muted">P50 / P95</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ metric.p50LatencyMs ?? '—' }} / {{ metric.p95LatencyMs ?? '—' }} ms</dd></div>
            <div><dt class="text-xs text-muted">Total cost</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ cost(metric.totalCostUsdMicros) }}</dd></div>
            <div><dt class="text-xs text-muted">Useful rating</dt><dd class="mt-0.5 text-sm font-semibold text-highlighted">{{ percent(metric.usefulFeedbackRate) }} <span class="text-xs font-normal text-muted">({{ metric.ratingCount }})</span></dd></div>
          </dl>

          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p class="text-xs text-muted">Zero tolerance: scope {{ metric.scopeViolationCount }} · approval bypass {{ metric.approvalBypassCount }} · prohibited effect {{ metric.prohibitedEffectCount }}</p>
            <ul v-if="metric.blockers.length" class="space-y-1 text-xs text-error" aria-label="Pilot gate blockers">
              <li v-for="blocker in metric.blockers" :key="blocker" class="flex items-start gap-1.5"><UIcon name="i-lucide-circle-x" class="mt-0.5 size-3 shrink-0" />{{ blockerLabel(blocker) }}</li>
            </ul>
            <p v-else class="text-xs font-medium text-success">All automated thresholds passed.</p>
          </div>
        </article>
      </div>
      <p class="text-xs text-dimmed">Generated {{ new Date(data.generatedAt).toLocaleString() }}</p>
    </template>
  </section>
</template>
