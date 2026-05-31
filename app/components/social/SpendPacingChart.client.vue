<script setup lang="ts">
import type { DailyTotal } from '~/types'

const props = defineProps<{
  totals: DailyTotal[]
  loading: boolean
  accountName?: string | null
  estimated?: boolean
}>()

const safeTotals = computed(() => (Array.isArray(props.totals) ? props.totals : []))

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

// ── Dimensions (match SpendChart) ──
const marginLeft = 55
const marginTop = 10
const marginRight = 10
const marginBottom = 22
const chartWidth = 700
const chartHeight = 220
const vbW = marginLeft + chartWidth + marginRight
const vbH = marginTop + chartHeight + marginBottom

// ── Month context ──
const sorted = computed(() => [...safeTotals.value].sort((a, b) => a.date.localeCompare(b.date)))
const monthPrefix = computed(() => sorted.value[0]?.date?.slice(0, 7) || '')
const daysInMonth = computed(() => {
  const first = sorted.value[0]?.date
  if (!first) return 30
  const [y, m] = first.split('-').map(Number)
  return new Date(y!, m!, 0).getDate()
})
const dayOfMonth = (date: string) => parseInt(date.slice(8, 10), 10)

// ── Cumulative actual spend ──
const cumulative = computed(() => {
  let run = 0
  return sorted.value.map((t) => {
    run += t.spend
    return { day: dayOfMonth(t.date), date: t.date, cum: run }
  })
})
const spendToDate = computed(() => (cumulative.value.length ? cumulative.value[cumulative.value.length - 1]!.cum : 0))
const lastDay = computed(() => (cumulative.value.length ? cumulative.value[cumulative.value.length - 1]!.day : 0))

// ── Budget (daily budget is repeated on every totals row) ──
const dailyBudget = computed(() => sorted.value[0]?.budget || 0)
const hasBudget = computed(() => dailyBudget.value > 0)
const budgetTotal = computed(() => dailyBudget.value * daysInMonth.value)
const idealToDate = computed(() => dailyBudget.value * lastDay.value)

// ── Run-rate projection to month-end ──
const runRate = computed(() => (lastDay.value > 0 ? spendToDate.value / lastDay.value : 0))
const projectedTotal = computed(() => Math.round(runRate.value * daysInMonth.value))

// ── Scales ──
const yMax = computed(() => {
  const max = Math.max(1, spendToDate.value, projectedTotal.value, hasBudget.value ? budgetTotal.value : 0)
  return max * 1.08
})
const xScale = (day: number) => (daysInMonth.value > 1 ? ((day - 1) / (daysInMonth.value - 1)) * chartWidth : 0)
const yScale = (v: number) => chartHeight - (v / yMax.value) * chartHeight

// ── Paths ──
const actualPoints = computed(() => cumulative.value.map((p) => `${xScale(p.day)},${yScale(p.cum)}`).join(' '))
const actualArea = computed(() => {
  if (!cumulative.value.length) return ''
  const pts = cumulative.value.map((p) => `${xScale(p.day)},${yScale(p.cum)}`).join(' ')
  const first = cumulative.value[0]!
  const last = cumulative.value[cumulative.value.length - 1]!
  return `${xScale(first.day)},${chartHeight} ${pts} ${xScale(last.day)},${chartHeight}`
})
const budgetPoints = computed(() =>
  hasBudget.value ? `${xScale(1)},${yScale(dailyBudget.value)} ${xScale(daysInMonth.value)},${yScale(budgetTotal.value)}` : ''
)
const projectionPoints = computed(() => {
  if (!cumulative.value.length || lastDay.value >= daysInMonth.value) return ''
  return `${xScale(lastDay.value)},${yScale(spendToDate.value)} ${xScale(daysInMonth.value)},${yScale(projectedTotal.value)}`
})

// ── Pace status ──
const paceStatus = computed(() => {
  if (!hasBudget.value) return null
  const diff = spendToDate.value - idealToDate.value
  const pct = idealToDate.value > 0 ? diff / idealToDate.value : 0
  if (Math.abs(pct) <= 0.05) return { label: 'On pace', color: 'text-green-500' }
  return diff > 0
    ? { label: 'Over pace', color: 'text-red-500' }
    : { label: 'Under pace', color: 'text-amber-500' }
})

// ── Axis labels ──
const yLabels = computed(() => ({ top: yMax.value, mid: yMax.value / 2 }))
const xTicks = computed(() => {
  const n = daysInMonth.value
  const step = Math.max(1, Math.ceil(n / 6))
  const ticks: number[] = []
  for (let d = 1; d <= n; d += step) ticks.push(d)
  if (ticks[ticks.length - 1] !== n) ticks.push(n)
  return ticks
})
const tickLabel = (day: number) => {
  const ds = `${monthPrefix.value}-${String(day).padStart(2, '0')}`
  return new Date(ds + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="border border-default rounded-xl p-4 bg-elevated/30">
    <USkeleton class="w-full h-[260px] rounded-lg" />
  </div>

  <!-- Empty -->
  <div v-else-if="!safeTotals.length" class="border border-default rounded-xl p-6 bg-elevated/30 flex items-center justify-center h-[200px]">
    <div class="text-center">
      <UIcon name="i-lucide-trending-up" class="w-8 h-8 text-muted/40 mx-auto mb-2" />
      <p class="text-sm text-muted">Sync to populate the pacing chart</p>
    </div>
  </div>

  <!-- Chart -->
  <div v-else class="border border-default rounded-xl bg-elevated/30 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-default/50">
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-1.5">
          <span v-if="accountName" class="text-muted">{{ accountName }} —</span>
          <span class="text-muted">Spend to date</span>
          <span class="font-medium tabular-nums">{{ formatCurrency(spendToDate) }}</span>
          <span v-if="estimated" class="ml-2 text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Estimated daily breakdown</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-muted">Projected</span>
          <span class="font-medium tabular-nums">~{{ formatCurrency(projectedTotal) }}</span>
        </div>
      </div>
      <div v-if="paceStatus" class="text-xs font-medium" :class="paceStatus.color">
        {{ paceStatus.label }} · budget {{ formatCurrency(budgetTotal) }}
      </div>
    </div>

    <!-- SVG -->
    <div class="px-2 pb-1 relative">
      <ClientOnly>
        <svg class="w-full" :viewBox="`0 0 ${vbW} ${vbH}`" preserveAspectRatio="xMidYMid meet">
          <g :transform="`translate(${marginLeft}, ${marginTop})`">
            <!-- Grid -->
            <line x1="0" y1="0" :x2="chartWidth" y2="0" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight / 2" :x2="chartWidth" :y2="chartHeight / 2" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight" :x2="chartWidth" :y2="chartHeight" stroke="currentColor" opacity="0.06" />

            <!-- Actual cumulative area + line -->
            <polygon v-if="actualArea" :points="actualArea" fill="#3b82f6" opacity="0.12" />
            <polyline :points="actualPoints" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

            <!-- Ideal budget pace line (emerald) -->
            <polyline v-if="budgetPoints" :points="budgetPoints" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="6,4" stroke-linecap="round" />

            <!-- Run-rate projection (neutral dashed) -->
            <polyline v-if="projectionPoints" :points="projectionPoints" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="4,4" stroke-linecap="round" />
          </g>

          <!-- Y-axis labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text :x="marginLeft - 6" :y="marginTop + 4" text-anchor="end">{{ formatCurrency(yLabels.top) }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight / 2 + 4" text-anchor="end">{{ formatCurrency(yLabels.mid) }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight + 4" text-anchor="end">$0</text>
          </g>

          <!-- X-axis labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text
              v-for="d in xTicks"
              :key="d"
              :x="marginLeft + xScale(d)"
              :y="vbH - 4"
              text-anchor="middle"
            >
              {{ tickLabel(d) }}
            </text>
          </g>
        </svg>
      </ClientOnly>
    </div>

    <!-- Legend -->
    <div class="flex items-center gap-4 px-4 py-2 border-t border-default/50 text-xs text-muted">
      <span class="flex items-center gap-1.5"><span class="block h-0.5 w-4 bg-[#3b82f6]"></span>Spend to date</span>
      <span v-if="hasBudget" class="flex items-center gap-1.5"><span class="block h-0.5 w-4 border-t-2 border-dashed border-emerald-500"></span>Budget pace</span>
      <span v-if="projectionPoints" class="flex items-center gap-1.5"><span class="block h-0.5 w-4 border-t-2 border-dashed border-gray-400"></span>Projection</span>
    </div>
  </div>
</template>
