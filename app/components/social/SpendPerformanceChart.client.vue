<script setup lang="ts">
import type { DailyTotal } from '~/types'

const props = defineProps<{
  totals: DailyTotal[]
  loading: boolean
  accountName?: string | null
  estimated?: boolean
}>()

const safeTotals = computed(() => (Array.isArray(props.totals) ? props.totals : []))
const sorted = computed(() => [...safeTotals.value].sort((a, b) => a.date.localeCompare(b.date)))

// ── Dimensions (match SpendChart) ──
const marginLeft = 55
const marginTop = 10
const marginRight = 10
const marginBottom = 22
const chartWidth = 700
const chartHeight = 220
const vbW = marginLeft + chartWidth + marginRight
const vbH = marginTop + chartHeight + marginBottom

// ── Metrics ──
type MetricKey = 'roas' | 'cpa' | 'ctr' | 'cpc'
const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'roas', label: 'ROAS' },
  { key: 'cpa', label: 'CPA' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
]
const selectedMetric = ref<MetricKey>('roas')
const manualSelect = ref(false)
function selectMetric(k: MetricKey) {
  selectedMetric.value = k
  manualSelect.value = true
}

const totalRevenue = computed(() => sorted.value.reduce((s, t) => s + (t.revenue || 0), 0))
const totalConversions = computed(() => sorted.value.reduce((s, t) => s + (t.conversions || 0), 0))
const totalImpressions = computed(() => sorted.value.reduce((s, t) => s + (t.impressions || 0), 0))
const totalClicks = computed(() => sorted.value.reduce((s, t) => s + (t.clicks || 0), 0))

// Each metric needs its OWN denominator: ROAS needs revenue, CPA conversions,
// CTR impressions, CPC clicks. (Meta often has conversions but no revenue — so
// ROAS can be empty while CPA is perfectly valid.)
function metricHasData(k: MetricKey): boolean {
  switch (k) {
    case 'roas': return totalRevenue.value > 0
    case 'cpa': return totalConversions.value > 0
    case 'ctr': return totalImpressions.value > 0
    case 'cpc': return totalClicks.value > 0
  }
}

// Until the user picks a metric, auto-default to the best available
// (ROAS → CPA → CTR → CPC), skipping any with no backing data.
watch([totalRevenue, totalConversions, totalImpressions, totalClicks], () => {
  if (manualSelect.value) return
  if (!metricHasData(selectedMetric.value)) {
    const best = (['roas', 'cpa', 'ctr', 'cpc'] as MetricKey[]).find(metricHasData)
    if (best) selectedMetric.value = best
  }
}, { immediate: true })

const activeMetric = computed(() => METRICS.find((m) => m.key === selectedMetric.value)!)
const noData = computed(() => !metricHasData(selectedMetric.value))
const noDataReason = computed(() => {
  switch (selectedMetric.value) {
    case 'roas': return { what: 'revenue', hint: 'ROAS needs revenue from the platform. Try CPA, CTR or CPC.' }
    case 'cpa': return { what: 'conversion', hint: 'CPA needs conversions from the platform. Try CTR or CPC.' }
    default: return { what: 'delivery', hint: 'No impressions or clicks recorded for this period.' }
  }
})

// Per-day metric value (null when the denominator is missing → skipped, not zeroed)
function metricValue(t: DailyTotal): number | null {
  switch (selectedMetric.value) {
    case 'roas': return t.spend > 0 ? t.revenue / t.spend : null
    case 'cpa': return t.conversions > 0 ? t.spend / t.conversions : null
    case 'ctr': return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null
    case 'cpc': return t.clicks > 0 ? t.spend / t.clicks : null
  }
}

const points = computed(() =>
  sorted.value.map((t, i) => ({ i, date: t.date, value: metricValue(t) }))
)
const validPoints = computed(() => points.value.filter((p) => p.value != null) as { i: number; date: string; value: number }[])

// ── Formatting ──
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
function formatMetric(v: number): string {
  switch (selectedMetric.value) {
    case 'roas': return `${v.toFixed(2)}x`
    case 'ctr': return `${v.toFixed(2)}%`
    case 'cpa':
    case 'cpc': return fmtCurrency(v)
  }
}

// Headline = period aggregate (not the average of daily ratios)
const aggregate = computed<number | null>(() => {
  const spend = sorted.value.reduce((s, t) => s + t.spend, 0)
  const clicks = sorted.value.reduce((s, t) => s + t.clicks, 0)
  const impressions = sorted.value.reduce((s, t) => s + t.impressions, 0)
  switch (selectedMetric.value) {
    case 'roas': return spend > 0 ? totalRevenue.value / spend : null
    case 'cpa': return totalConversions.value > 0 ? spend / totalConversions.value : null
    case 'ctr': return impressions > 0 ? (clicks / impressions) * 100 : null
    case 'cpc': return clicks > 0 ? spend / clicks : null
  }
})

// ── Scales ──
const n = computed(() => points.value.length)
const yMax = computed(() => {
  const max = Math.max(0, ...validPoints.value.map((p) => p.value))
  return max > 0 ? max * 1.1 : 1
})
const xScale = (i: number) => (n.value > 1 ? (i / (n.value - 1)) * chartWidth : chartWidth / 2)
const yScale = (v: number) => chartHeight - (v / yMax.value) * chartHeight

const linePoints = computed(() => validPoints.value.map((p) => `${xScale(p.i)},${yScale(p.value)}`).join(' '))

// ── Axis labels ──
const yLabels = computed(() => ({ top: yMax.value, mid: yMax.value / 2 }))
const xTickIndices = computed(() => {
  const count = n.value
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil(count / 6)
  const indices: number[] = [0]
  for (let i = step; i < count - 1; i += step) indices.push(i)
  indices.push(count - 1)
  return indices
})
function formatDateShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function yLabel(v: number) {
  switch (selectedMetric.value) {
    case 'roas': return `${v.toFixed(1)}x`
    case 'ctr': return `${v.toFixed(1)}%`
    default: return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)
  }
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="border border-default rounded-xl p-4 bg-elevated/30">
    <USkeleton class="w-full h-[260px] rounded-lg" />
  </div>

  <!-- Empty (no data at all) -->
  <div v-else-if="!safeTotals.length" class="border border-default rounded-xl p-6 bg-elevated/30 flex items-center justify-center h-[200px]">
    <div class="text-center">
      <UIcon name="i-lucide-activity" class="w-8 h-8 text-muted/40 mx-auto mb-2" />
      <p class="text-sm text-muted">Sync to populate the performance chart</p>
    </div>
  </div>

  <!-- Chart -->
  <div v-else class="border border-default rounded-xl bg-elevated/30 overflow-hidden">
    <!-- Header: metric switcher + headline -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-default/50 gap-3">
      <div class="flex items-center gap-1">
        <UButton
          v-for="m in METRICS"
          :key="m.key"
          :label="m.label"
          size="xs"
          :color="selectedMetric === m.key ? 'primary' : 'neutral'"
          :variant="selectedMetric === m.key ? 'solid' : 'ghost'"
          @click="selectMetric(m.key)"
        />
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span v-if="accountName" class="text-muted">{{ accountName }} —</span>
        <span class="text-muted">{{ activeMetric.label }}</span>
        <span v-if="aggregate != null" class="font-medium tabular-nums">{{ formatMetric(aggregate) }}</span>
        <span v-else class="text-muted">—</span>
        <span v-if="estimated" class="ml-1 text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Estimated</span>
      </div>
    </div>

    <!-- No conversion data state for ROAS/CPA -->
    <div v-if="noData" class="p-6 flex items-center justify-center h-[200px]">
      <div class="text-center">
        <UIcon name="i-lucide-circle-off" class="w-8 h-8 text-muted/40 mx-auto mb-2" />
        <p class="text-sm text-muted">No {{ noDataReason.what }} data for this period</p>
        <p class="text-xs text-muted/70 mt-1">{{ noDataReason.hint }}</p>
      </div>
    </div>

    <!-- SVG -->
    <div v-else class="px-2 pb-1 relative">
      <ClientOnly>
        <svg class="w-full" :viewBox="`0 0 ${vbW} ${vbH}`" preserveAspectRatio="xMidYMid meet">
          <g :transform="`translate(${marginLeft}, ${marginTop})`">
            <!-- Grid -->
            <line x1="0" y1="0" :x2="chartWidth" y2="0" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight / 2" :x2="chartWidth" :y2="chartHeight / 2" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight" :x2="chartWidth" :y2="chartHeight" stroke="currentColor" opacity="0.06" />

            <!-- Metric line -->
            <polyline :points="linePoints" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            <!-- Points -->
            <circle v-for="p in validPoints" :key="p.i" :cx="xScale(p.i)" :cy="yScale(p.value)" r="2" fill="#8b5cf6" />
          </g>

          <!-- Y-axis labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text :x="marginLeft - 6" :y="marginTop + 4" text-anchor="end">{{ yLabel(yLabels.top) }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight / 2 + 4" text-anchor="end">{{ yLabel(yLabels.mid) }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight + 4" text-anchor="end">{{ yLabel(0) }}</text>
          </g>

          <!-- X-axis labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text
              v-for="idx in xTickIndices"
              :key="idx"
              :x="marginLeft + xScale(idx)"
              :y="vbH - 4"
              text-anchor="middle"
            >
              {{ points[idx] ? formatDateShort(points[idx].date) : '' }}
            </text>
          </g>
        </svg>
      </ClientOnly>
    </div>
  </div>
</template>
