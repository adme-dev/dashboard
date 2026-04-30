<script setup lang="ts">
import type { AnomalyType, AnomalySeverity } from '~~/server/utils/anomalyDetection/types'

interface AnomalyMetric {
  label: string
  value: number
  format: 'currency' | 'percent' | 'number'
}

interface Anomaly {
  id: string
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  status: 'open' | 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed'
  title: string
  description: string
  recommendation: string | null
  tags: string[] | null
  data_sources: string[]
  metric: AnomalyMetric | null
  comparison: (AnomalyMetric & { trend?: 'up' | 'down' }) | null
  context: {
    period?: string
    range?: { from?: string | null; to?: string | null }
    category?: string
    vendor?: string
    client?: string
    account?: string
  } | null
  group_key: string | null
  first_detected_at: string
  last_detected_at: string
  snoozed_until: string | null
}

const props = defineProps<{
  anomaly: Anomaly
  // When rendered as a child of a grouped incident, suppress the bottom border
  // and reduce visual weight (Phase 4.6 will set this to true for nested cards).
  nested?: boolean
}>()

const emit = defineEmits<{
  (e: 'mutated'): void
  (e: 'open-action-plan', anomaly: Anomaly): void
}>()

const toast = useToast()

// ── severity & type helpers ─────────────
const severityMeta: Record<AnomalySeverity, { label: string; color: 'error' | 'warning' | 'info'; icon: string }> = {
  critical: { label: 'Critical', color: 'error', icon: 'i-lucide-alert-octagon' },
  warning: { label: 'Warning', color: 'warning', icon: 'i-lucide-alert-triangle' },
  info: { label: 'Watch', color: 'info', icon: 'i-lucide-info' },
}

// ── formatters ─────────────
function formatMetric(metric?: AnomalyMetric | null) {
  if (!metric) return '-'
  if (metric.format === 'currency') return formatCurrency(metric.value)
  if (metric.format === 'percent') return formatPercent(metric.value)
  return formatNumber(metric.value)
}
function formatCurrency(v: number) {
  return Number(v).toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: Math.abs(v) < 1 ? 2 : 0,
  })
}
function formatPercent(v: number) {
  return Number(v).toLocaleString('en-AU', { style: 'percent', maximumFractionDigits: 1 })
}
function formatNumber(v: number) {
  return Number(v).toLocaleString('en-AU', { maximumFractionDigits: 1 })
}
function formatDate(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function formatRange(range?: { from?: string | null; to?: string | null } | null) {
  if (!range || (!range.from && !range.to)) return null
  const from = range.from ? new Date(range.from) : null
  const to = range.to ? new Date(range.to) : null
  const fromLabel = from && !Number.isNaN(from.valueOf())
    ? from.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const toLabel = to && !Number.isNaN(to.valueOf())
    ? to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  return fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : (fromLabel || toLabel)
}

// ── mutation handling ─────────────
const mutating = ref(false)

async function patch(body: Record<string, any>) {
  mutating.value = true
  try {
    await $fetch(`/api/ai/anomalies/${props.anomaly.id}`, {
      method: 'PATCH',
      body,
    })
    toast.add({ title: 'Updated', color: 'success' })
    emit('mutated')
  } catch (err: any) {
    toast.add({
      title: 'Update failed',
      description: err?.statusMessage || err?.message || String(err),
      color: 'error',
    })
  } finally {
    mutating.value = false
  }
}

// Acknowledge
async function acknowledge() { await patch({ action: 'acknowledge' }) }

// Snooze
async function snoozeHours(hours: number) {
  const until = new Date(Date.now() + hours * 3600_000).toISOString()
  await patch({ action: 'snooze', snoozedUntil: until })
}

// Custom snooze modal
const customSnoozeOpen = ref(false)
const customSnoozeDate = ref('')
async function snoozeCustom() {
  if (!customSnoozeDate.value) return
  const isoDate = new Date(customSnoozeDate.value).toISOString()
  customSnoozeOpen.value = false
  await patch({ action: 'snooze', snoozedUntil: isoDate })
}

// Dismiss
const dismissOpen = ref(false)
const dismissReason = ref('')
async function confirmDismiss() {
  dismissOpen.value = false
  await patch({ action: 'dismiss', reason: dismissReason.value || undefined })
  dismissReason.value = ''
}

// Resolve
const resolveOpen = ref(false)
const resolveNotes = ref('')
async function confirmResolve() {
  resolveOpen.value = false
  await patch({ action: 'resolve', resolutionNotes: resolveNotes.value || undefined })
  resolveNotes.value = ''
}

// Reopen (for resolved/dismissed)
async function reopen() { await patch({ action: 'reopen' }) }

// Action plan
function openActionPlan() {
  emit('open-action-plan', props.anomaly)
}

// Show snooze status info
const snoozeInfo = computed(() => {
  if (props.anomaly.status !== 'snoozed' || !props.anomaly.snoozed_until) return null
  return formatDate(props.anomaly.snoozed_until)
})

const isActive = computed(() =>
  ['open', 'acknowledged', 'snoozed'].includes(props.anomaly.status),
)
</script>

<template>
  <UCard :ui="{ body: 'space-y-4', root: nested ? 'shadow-none border-none bg-transparent' : '' }">
    <!-- Top: severity badge + detected time + data sources -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <UBadge :color="severityMeta[anomaly.severity].color" variant="solid" size="sm">
            <div class="flex items-center gap-1">
              <UIcon :name="severityMeta[anomaly.severity].icon" class="size-4" />
              <span>{{ severityMeta[anomaly.severity].label }}</span>
            </div>
          </UBadge>
          <UBadge v-if="anomaly.status === 'acknowledged'" color="neutral" variant="subtle" size="sm">
            Acknowledged
          </UBadge>
          <UBadge v-else-if="anomaly.status === 'snoozed'" color="neutral" variant="subtle" size="sm">
            Snoozed{{ snoozeInfo ? ` until ${snoozeInfo}` : '' }}
          </UBadge>
          <UBadge v-else-if="anomaly.status === 'resolved'" color="neutral" variant="subtle" size="sm">
            Resolved
          </UBadge>
          <UBadge v-else-if="anomaly.status === 'dismissed'" color="neutral" variant="subtle" size="sm">
            Dismissed
          </UBadge>
          <span class="text-xs text-muted">
            Detected {{ formatDate(anomaly.first_detected_at) || 'recently' }}
          </span>
        </div>
        <h3 class="mt-2 text-xl font-semibold">{{ anomaly.title }}</h3>
        <p class="mt-1 text-sm text-muted">{{ anomaly.description }}</p>
      </div>

      <div v-if="anomaly.data_sources?.length" class="flex flex-wrap gap-2">
        <UBadge v-for="source in anomaly.data_sources" :key="source" color="neutral" variant="subtle">
          {{ source }}
        </UBadge>
      </div>
    </div>

    <!-- Metric / Comparison -->
    <div v-if="anomaly.metric || anomaly.comparison" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div v-if="anomaly.metric" class="rounded-lg border border-default p-4">
        <p class="text-xs text-muted uppercase tracking-wide">{{ anomaly.metric.label }}</p>
        <p class="mt-1 text-lg font-semibold">{{ formatMetric(anomaly.metric) }}</p>
      </div>
      <div v-if="anomaly.comparison" class="rounded-lg border border-default p-4">
        <p class="text-xs text-muted uppercase tracking-wide">{{ anomaly.comparison.label }}</p>
        <div class="mt-1 flex items-center gap-2">
          <p class="text-lg font-semibold">{{ formatMetric(anomaly.comparison) }}</p>
          <UIcon
            v-if="anomaly.comparison.trend"
            :name="anomaly.comparison.trend === 'down' ? 'i-lucide-arrow-down-right' : 'i-lucide-arrow-up-right'"
            :class="[anomaly.comparison.trend === 'down' ? 'text-red-500' : 'text-emerald-500', 'size-4']"
          />
        </div>
      </div>
    </div>

    <!-- Context -->
    <div
      v-if="anomaly.context?.period || anomaly.context?.range || anomaly.context?.category || anomaly.context?.vendor || anomaly.context?.client"
      class="grid grid-cols-1 gap-3 text-sm text-muted sm:grid-cols-2"
    >
      <div v-if="anomaly.context?.period">
        <span class="font-medium text-foreground">Reporting period:</span>
        <span class="ml-2">{{ anomaly.context.period }}</span>
      </div>
      <div v-if="anomaly.context?.range">
        <span class="font-medium text-foreground">Data range:</span>
        <span class="ml-2">{{ formatRange(anomaly.context.range) }}</span>
      </div>
      <div v-if="anomaly.context?.category">
        <span class="font-medium text-foreground">Category:</span>
        <span class="ml-2">{{ anomaly.context.category }}</span>
      </div>
      <div v-if="anomaly.context?.vendor">
        <span class="font-medium text-foreground">Vendor:</span>
        <span class="ml-2">{{ anomaly.context.vendor }}</span>
      </div>
      <div v-if="anomaly.context?.client">
        <span class="font-medium text-foreground">Client:</span>
        <span class="ml-2">{{ anomaly.context.client }}</span>
      </div>
    </div>

    <!-- Recommendation -->
    <div
      v-if="anomaly.recommendation"
      class="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-500/10"
    >
      <p class="text-sm font-medium text-amber-800 dark:text-amber-200">Recommended next step</p>
      <p class="mt-1 text-sm text-amber-700 dark:text-amber-100/80">{{ anomaly.recommendation }}</p>
    </div>

    <!-- Tags -->
    <div v-if="anomaly.tags?.length" class="flex flex-wrap gap-2">
      <UTooltip v-for="tag in anomaly.tags" :key="tag" :text="`Tag: ${tag}`">
        <UBadge color="primary" variant="soft">{{ tag }}</UBadge>
      </UTooltip>
    </div>

    <!-- Action footer (only for active statuses) -->
    <div v-if="isActive" class="flex flex-wrap items-center gap-2 pt-3 border-t border-default">
      <UButton
        label="Get AI Action Plan"
        icon="i-lucide-sparkles"
        color="primary"
        variant="soft"
        size="sm"
        @click="openActionPlan"
      />

      <UButton
        v-if="anomaly.status === 'open' || anomaly.status === 'snoozed'"
        label="Acknowledge"
        icon="i-lucide-check"
        color="neutral"
        variant="soft"
        size="sm"
        :loading="mutating"
        @click="acknowledge"
      />

      <UPopover>
        <UButton label="Snooze" icon="i-lucide-clock" color="neutral" variant="soft" size="sm" :loading="mutating" />
        <template #content>
          <div class="p-2 flex flex-col gap-1 min-w-[180px]">
            <UButton size="xs" variant="ghost" @click="snoozeHours(24)">24 hours</UButton>
            <UButton size="xs" variant="ghost" @click="snoozeHours(24 * 7)">7 days</UButton>
            <UButton size="xs" variant="ghost" @click="snoozeHours(24 * 30)">30 days</UButton>
            <UButton size="xs" variant="ghost" @click="customSnoozeOpen = true">Custom...</UButton>
          </div>
        </template>
      </UPopover>

      <UButton
        label="Dismiss"
        icon="i-lucide-x"
        color="neutral"
        variant="soft"
        size="sm"
        :loading="mutating"
        @click="dismissOpen = true"
      />

      <UButton
        label="Resolve"
        icon="i-lucide-check-check"
        color="neutral"
        variant="soft"
        size="sm"
        :loading="mutating"
        @click="resolveOpen = true"
      />
    </div>

    <!-- Footer for resolved/dismissed: reopen -->
    <div v-else class="flex flex-wrap items-center gap-2 pt-3 border-t border-default">
      <UButton
        label="Reopen"
        icon="i-lucide-refresh-ccw"
        color="neutral"
        variant="soft"
        size="sm"
        :loading="mutating"
        @click="reopen"
      />
      <span v-if="anomaly.status === 'resolved'" class="text-xs text-muted">
        Auto-resolved when no longer detected
      </span>
    </div>

    <!-- Custom snooze modal -->
    <UModal v-model:open="customSnoozeOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Snooze until</h3>
          <UInput v-model="customSnoozeDate" type="datetime-local" />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="customSnoozeOpen = false">Cancel</UButton>
            <UButton :disabled="!customSnoozeDate" @click="snoozeCustom">Snooze</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Dismiss modal -->
    <UModal v-model:open="dismissOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Dismiss this anomaly?</h3>
          <p class="text-sm text-muted">
            Dismissed anomalies are archived. If the underlying condition recurs, a new incident will be created.
          </p>
          <UTextarea
            v-model="dismissReason"
            placeholder="Optional reason (audit trail)…"
            :rows="3"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="dismissOpen = false">Cancel</UButton>
            <UButton color="error" @click="confirmDismiss">Dismiss</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Resolve modal -->
    <UModal v-model:open="resolveOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Mark as resolved</h3>
          <p class="text-sm text-muted">
            Use when the underlying issue has been fixed (e.g. you've topped up the bank account, settled an overdue invoice).
          </p>
          <UTextarea
            v-model="resolveNotes"
            placeholder="Optional resolution notes…"
            :rows="5"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="resolveOpen = false">Cancel</UButton>
            <UButton color="success" @click="confirmResolve">Resolve</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
