<script setup lang="ts">
import { computed } from 'vue'
import type {
  ClientFinancialSummary,
  FinancialAllocationCoverage,
  FinancialDataSource,
  FinancialSourceFreshness,
} from '~/types'

const props = defineProps<{
  summary: ClientFinancialSummary
  allocationCoverage: FinancialAllocationCoverage
  freshness: FinancialSourceFreshness[]
}>()

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const freshnessBySource = computed(() => new Map(props.freshness.map(item => [item.source, item])))

function formatCurrency(value: number): string {
  return Number.isFinite(value) ? currency.format(value) : 'Not available'
}

function formatHours(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}h` : 'Not available'
}

function formatPercentage(value: number | null): string | null {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)}%` : null
}

function sourceValue(value: number, source: FinancialDataSource): string {
  const state = freshnessBySource.value.get(source)?.status
  return state === 'unavailable' || state === 'not_connected' ? 'Not available' : formatCurrency(value)
}

function sourceContext(source: FinancialDataSource, fallback: string): string {
  return freshnessBySource.value.get(source)?.label || fallback
}

function marginReason(): string {
  switch (props.summary.marginReason) {
    case 'no_agi': return 'No AGI'
    case 'negative_agi': return 'Negative AGI'
    case 'source_conflict': return 'Source conflict'
    default: return 'Margin unavailable'
  }
}

const metrics = computed(() => [
  {
    label: 'Xero revenue',
    value: sourceValue(props.summary.xeroRevenue, 'xero_revenue'),
    context: sourceContext('xero_revenue', 'Eligible Xero revenue, ex GST'),
  },
  {
    label: 'Media spend',
    value: sourceValue(props.summary.mediaSpend, 'media_spend'),
    context: sourceContext('media_spend', 'Agency-paid media spend'),
  },
  {
    label: 'Agency Gross Income',
    value: formatCurrency(props.summary.agi),
    context: 'Xero revenue less media spend',
  },
  {
    label: 'Delivery cost',
    value: formatCurrency(props.summary.deliveryCost),
    context: 'Labour, expenses and supplier costs',
  },
  {
    label: 'Delivery profit',
    value: formatCurrency(props.summary.deliveryProfit),
    context: 'Agency Gross Income less delivery cost',
    tone: props.summary.deliveryProfit < 0 ? 'text-error' : 'text-success',
  },
  {
    label: 'Delivery margin',
    value: formatPercentage(props.summary.deliveryMarginPct) || '—',
    context: props.summary.deliveryMarginPct === null
      ? marginReason()
      : Number.isFinite(props.summary.deliveryMarginPct)
        ? 'Delivery profit as a share of AGI'
        : 'Margin unavailable',
    tone: Number.isFinite(props.summary.deliveryMarginPct)
      ? props.summary.deliveryMarginPct < 0 ? 'text-error' : 'text-success'
      : undefined,
  },
  {
    label: 'Hours',
    value: freshnessBySource.value.get('time_entries')?.status === 'unavailable'
      ? 'Not available'
      : formatHours(props.summary.hours),
    context: props.summary.hours === 0 ? 'No time recorded' : sourceContext('time_entries', 'Recorded operational time'),
  },
  {
    label: 'Allocation coverage',
    value: props.allocationCoverage.overall.percentage === null
      ? 'No allocatable sources'
      : formatPercentage(props.allocationCoverage.overall.percentage) || '—',
    context: props.allocationCoverage.overall.percentage === null
      ? 'No Xero or media sources in this period'
      : Number.isFinite(props.allocationCoverage.overall.percentage)
        ? `${props.allocationCoverage.overall.allocatedItemCount} of ${props.allocationCoverage.overall.totalItemCount} sources mapped`
        : 'Coverage unavailable',
  },
  {
    label: 'Active projects',
    value: Number.isFinite(props.summary.activeProjects) ? String(props.summary.activeProjects) : 'Not available',
    context: 'Projects with active status',
  },
])
</script>

<template>
  <section aria-label="Financial summary" class="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <UCard v-for="metric in metrics" :key="metric.label" class="h-full">
      <dl class="flex min-h-36 h-full flex-col justify-between gap-3">
        <dt class="text-sm font-medium text-muted">{{ metric.label }}</dt>
        <dd class="text-2xl font-semibold tabular-nums tracking-tight" :class="metric.tone">
          {{ metric.value }}
        </dd>
        <div class="flex items-start gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{{ metric.context }}</span>
        </div>
      </dl>
    </UCard>
  </section>
</template>
