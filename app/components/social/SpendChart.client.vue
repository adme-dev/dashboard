<script setup lang="ts">
import type { CampaignSeries, DailyTotal } from '~/types'

const props = defineProps<{
  campaigns: CampaignSeries[]
  totals: DailyTotal[]
  loading: boolean
  accountName?: string | null
  estimated?: boolean
}>()

const safeCampaigns = computed(() => Array.isArray(props.campaigns) ? props.campaigns : [])
const safeTotals = computed(() => Array.isArray(props.totals) ? props.totals : [])

// ── Reactive state ──
const visibleCampaigns = ref<Set<string>>(new Set())
const hoverIndex = ref<number | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const chartContainer = ref<HTMLDivElement | null>(null)

watch(() => props.campaigns, (camps) => {
  visibleCampaigns.value = new Set((camps || []).map(c => c.campaignId))
}, { immediate: true })

// ── Formatters ──
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

const formatCurrencyFull = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

// ── Chart dimensions ──
const marginLeft = 55
const marginTop = 10
const marginRight = 10
const marginBottom = 22
const chartWidth = 700
const chartHeight = 220
const vbW = marginLeft + chartWidth + marginRight
const vbH = marginTop + chartHeight + marginBottom

// ── Data helpers ──
const allDates = computed(() => safeTotals.value.map(t => t.date))
const dayCount = computed(() => allDates.value.length)

// Campaigns sorted by monthly spend desc (largest at bottom of stack)
const orderedCampaigns = computed(() =>
  [...safeCampaigns.value].sort((a, b) => a.monthlySpend - b.monthlySpend) // ascending so largest is at bottom in SVG (rendered first)
)

// Build a lookup: campaignId → Map<date, spend>
const campDailyLookup = computed(() => {
  const map = new Map<string, Map<string, number>>()
  for (const c of safeCampaigns.value) {
    const dateMap = new Map<string, number>()
    for (const d of c.daily) dateMap.set(d.date, d.spend)
    map.set(c.campaignId, dateMap)
  }
  return map
})

// For each date, compute stacked segments (bottom-up)
// Returns array of { date, segments: [{ campaignId, base, top, color }], totalVisible }
const stackedBars = computed(() => {
  const visible = visibleCampaigns.value
  // Order: largest monthly spend at bottom
  const camps = orderedCampaigns.value.filter(c => visible.has(c.campaignId))

  return allDates.value.map(date => {
    let cumulative = 0
    const segments: { campaignId: string; base: number; top: number; color: string }[] = []
    for (const c of camps) {
      const spend = campDailyLookup.value.get(c.campaignId)?.get(date) ?? 0
      if (spend > 0) {
        segments.push({ campaignId: c.campaignId, base: cumulative, top: cumulative + spend, color: c.color })
        cumulative += spend
      }
    }
    return { date, segments, totalVisible: cumulative }
  })
})

// Y-axis max: based on visible stacked totals + budget
const yMax = computed(() => {
  let max = 1
  for (const bar of stackedBars.value) {
    if (bar.totalVisible > max) max = bar.totalVisible
  }
  for (const t of safeTotals.value) {
    if (t.budget > 0 && t.budget > max) max = t.budget
  }
  return max + max * 0.08
})

const yScale = (v: number) => chartHeight - (v / yMax.value) * chartHeight

// Bar geometry
const barGap = computed(() => dayCount.value > 20 ? 1 : 2)
const barSlotWidth = computed(() => dayCount.value > 0 ? chartWidth / dayCount.value : 0)
const barW = computed(() => Math.max(2, barSlotWidth.value - barGap.value))

function barX(i: number) {
  return i * barSlotWidth.value + (barSlotWidth.value - barW.value) / 2
}

// Budget line path
const budgetLinePath = computed(() => {
  if (!safeTotals.value.some(t => t.budget > 0)) return ''
  return safeTotals.value.map((t, i) => {
    const x = i * barSlotWidth.value + barSlotWidth.value / 2
    return `${x},${yScale(t.budget)}`
  }).join(' ')
})

const hasBudget = computed(() => safeTotals.value.some(t => t.budget > 0))
// Header total comes from authoritative per-campaign monthly spend (top N +
// "Other" in global mode, or every campaign when scoped) so it matches the
// TOTAL SPEND card. The daily bars are an estimated breakdown that can sum a
// little lower, so we don't derive the header from them. Falls back to the
// summed daily totals only if no campaign rows are present.
const totalSpend = computed(() => {
  const fromCampaigns = safeCampaigns.value.reduce((s, c) => s + (c.monthlySpend || 0), 0)
  return fromCampaigns > 0 ? fromCampaigns : safeTotals.value.reduce((s, t) => s + t.spend, 0)
})
const totalBudget = computed(() => safeTotals.value.reduce((s, t) => s + t.budget, 0))
const overUnder = computed(() => totalSpend.value - totalBudget.value)

// Y-axis labels
const yLabels = computed(() => ({ top: yMax.value, mid: yMax.value / 2 }))

// X-axis labels — show ~5–7 labels evenly spaced
const xTickIndices = computed(() => {
  const n = dayCount.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil(n / 6)
  const indices: number[] = [0]
  for (let i = step; i < n - 1; i += step) indices.push(i)
  indices.push(n - 1)
  return indices
})

function formatDateShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── Hover / Tooltip ──
function onChartMousemove(e: MouseEvent) {
  if (!chartContainer.value || !dayCount.value) return
  const svg = chartContainer.value.querySelector('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * vbW - marginLeft
  const idx = Math.floor(svgX / barSlotWidth.value)
  hoverIndex.value = Math.max(0, Math.min(dayCount.value - 1, idx))
  const cr = chartContainer.value.getBoundingClientRect()
  tooltipX.value = e.clientX - cr.left
  tooltipY.value = e.clientY - cr.top
}

function onChartMouseleave() { hoverIndex.value = null }

const tooltipData = computed(() => {
  if (hoverIndex.value === null) return null
  const date = allDates.value[hoverIndex.value]
  const total = safeTotals.value[hoverIndex.value]
  if (!total) return null

  const campSpends: { name: string; color: string; spend: number; type: string | null }[] = []
  for (const c of safeCampaigns.value) {
    if (!visibleCampaigns.value.has(c.campaignId)) continue
    const spend = campDailyLookup.value.get(c.campaignId)?.get(date) ?? 0
    campSpends.push({ name: c.campaignName, color: c.color, spend, type: c.campaignType })
  }
  campSpends.sort((a, b) => b.spend - a.spend)

  return {
    date: new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    totalSpend: total.spend,
    budget: total.budget,
    campaigns: campSpends.filter(c => c.spend > 0), // only show campaigns with spend that day
  }
})

const tooltipFlip = computed(() => {
  if (!chartContainer.value) return false
  return tooltipX.value > (chartContainer.value.clientWidth || 700) - 260
})

// ── Legend ──
function toggleCampaign(id: string) {
  const s = new Set(visibleCampaigns.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  visibleCampaigns.value = s
}

// Campaign type badge helpers
const campaignTypeMap: Record<string, { label: string; color: string }> = {
  SEARCH: { label: 'Search', color: 'info' },
  PERFORMANCE_MAX: { label: 'PMax', color: 'primary' },
  VIDEO: { label: 'Video', color: 'error' },
  DISPLAY: { label: 'Display', color: 'success' },
  SHOPPING: { label: 'Shopping', color: 'warning' },
  DISCOVERY: { label: 'Discovery', color: 'neutral' },
  DEMAND_GEN: { label: 'Demand Gen', color: 'neutral' },
}

function getCampaignTypeBadge(type: string | null) {
  if (!type) return null
  return campaignTypeMap[type] || { label: type, color: 'neutral' }
}

// Sorted legend: by monthly spend desc
const legendCampaigns = computed(() =>
  [...safeCampaigns.value].sort((a, b) => b.monthlySpend - a.monthlySpend)
)

// Segment opacity: dim non-hovered bars
function segmentOpacity(_seg: { campaignId: string }, barIdx: number): number {
  if (hoverIndex.value !== null && hoverIndex.value !== barIdx) return 0.4
  return 0.85
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
      <UIcon name="i-lucide-bar-chart-3" class="w-8 h-8 text-muted/40 mx-auto mb-2" />
      <p class="text-sm text-muted">Sync to populate daily spend chart</p>
    </div>
  </div>

  <!-- Chart -->
  <div v-else class="border border-default rounded-xl bg-elevated/30 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-default/50">
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-1.5">
          <span v-if="accountName" class="text-muted">{{ accountName }} —</span>
          <span class="text-muted">Total Spend</span>
          <span class="font-medium tabular-nums">{{ formatCurrency(totalSpend) }}</span>
          <span v-if="estimated" class="ml-2 text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Estimated daily breakdown</span>
        </div>
        <div v-if="hasBudget" class="flex items-center gap-1.5">
          <span class="block h-0.5 w-4 border-t-2 border-dashed border-emerald-500"></span>
          <span class="text-muted">Budget</span>
          <span class="font-medium tabular-nums">{{ formatCurrency(totalBudget) }}</span>
        </div>
      </div>
      <div v-if="hasBudget && totalBudget > 0" class="text-xs font-medium tabular-nums" :class="overUnder > 0 ? 'text-red-500' : 'text-green-500'">
        {{ overUnder > 0 ? '+' : '' }}{{ formatCurrency(overUnder) }}
        {{ overUnder > 0 ? 'over' : 'under' }} budget
      </div>
    </div>

    <!-- SVG -->
    <div ref="chartContainer" class="px-2 pb-1 relative">
      <ClientOnly>
        <svg
          class="w-full"
          :viewBox="`0 0 ${vbW} ${vbH}`"
          preserveAspectRatio="xMidYMid meet"
          @mousemove="onChartMousemove"
          @mouseleave="onChartMouseleave"
        >
          <g :transform="`translate(${marginLeft}, ${marginTop})`">
            <!-- Grid lines -->
            <line x1="0" y1="0" :x2="chartWidth" y2="0" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight / 2" :x2="chartWidth" :y2="chartHeight / 2" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight" :x2="chartWidth" :y2="chartHeight" stroke="currentColor" opacity="0.06" />

            <!-- Stacked bars -->
            <template v-for="(bar, i) in stackedBars" :key="bar.date">
              <rect
                v-for="seg in bar.segments"
                :key="seg.campaignId"
                :x="barX(i)"
                :y="yScale(seg.top)"
                :width="barW"
                :height="Math.max(0, yScale(seg.base) - yScale(seg.top))"
                :fill="seg.color"
                :rx="barW > 4 ? 1.5 : 0"
                class="transition-opacity duration-150"
                :opacity="segmentOpacity(seg, i)"
              />
            </template>

            <!-- Budget line (emerald dashed) -->
            <polyline
              v-if="budgetLinePath"
              :points="budgetLinePath"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              stroke-dasharray="6,4"
              stroke-linejoin="round"
              stroke-linecap="round"
            />

            <!-- Hover highlight bar outline -->
            <rect
              v-if="hoverIndex !== null && stackedBars[hoverIndex]"
              :x="barX(hoverIndex) - 1"
              :y="yScale(stackedBars[hoverIndex].totalVisible) - 1"
              :width="barW + 2"
              :height="Math.max(0, chartHeight - yScale(stackedBars[hoverIndex].totalVisible) + 2)"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              opacity="0.2"
              :rx="barW > 4 ? 2 : 0"
            />
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
              v-for="idx in xTickIndices"
              :key="idx"
              :x="marginLeft + idx * barSlotWidth + barSlotWidth / 2"
              :y="vbH - 4"
              text-anchor="middle"
            >
              {{ formatDateShort(allDates[idx]) }}
            </text>
          </g>
        </svg>

        <!-- Rich tooltip -->
        <div
          v-if="tooltipData && hoverIndex !== null"
          class="absolute z-10 pointer-events-none bg-default border border-default rounded-lg shadow-lg p-3 text-xs min-w-[200px] max-w-[280px]"
          :style="{
            top: `${Math.max(8, tooltipY - 20)}px`,
            left: tooltipFlip ? 'auto' : `${tooltipX + 14}px`,
            right: tooltipFlip ? `${(chartContainer?.clientWidth || 700) - tooltipX + 14}px` : 'auto',
          }"
        >
          <p class="font-medium text-default mb-2">{{ tooltipData.date }}</p>
          <!-- Total -->
          <div class="flex items-center justify-between mb-1 pb-1 border-b border-default/50">
            <span class="text-muted">Total</span>
            <span class="font-medium tabular-nums">{{ formatCurrencyFull(tooltipData.totalSpend) }}</span>
          </div>
          <!-- Budget -->
          <div v-if="tooltipData.budget > 0" class="flex items-center justify-between mb-1 pb-1 border-b border-default/50">
            <span class="text-muted">Budget</span>
            <span class="font-medium tabular-nums text-emerald-600">{{ formatCurrencyFull(tooltipData.budget) }}</span>
          </div>
          <!-- Per-campaign -->
          <div v-for="(c, i) in tooltipData.campaigns" :key="i" class="flex items-center gap-2 py-0.5">
            <span class="block w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: c.color }"></span>
            <span class="text-muted truncate flex-1">{{ c.name }}</span>
            <span class="font-medium tabular-nums shrink-0">{{ formatCurrencyFull(c.spend) }}</span>
          </div>
          <div v-if="!tooltipData.campaigns.length" class="text-muted py-0.5">No campaign spend</div>
        </div>

        <template #fallback>
          <USkeleton class="w-full h-[260px] rounded-lg" />
        </template>
      </ClientOnly>
    </div>

    <!-- Campaign legend (toggleable) -->
    <div class="px-4 py-2.5 border-t border-default/50 flex flex-wrap gap-1.5">
      <button
        v-for="camp in legendCampaigns"
        :key="camp.campaignId"
        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-elevated/50 transition-all cursor-pointer"
        :class="{ 'opacity-40': !visibleCampaigns.has(camp.campaignId) }"
        @click="toggleCampaign(camp.campaignId)"
      >
        <span class="block w-3 h-1.5 rounded-sm shrink-0" :style="{ backgroundColor: camp.color }"></span>
        <span class="truncate max-w-[140px]">{{ camp.campaignName }}</span>
        <UBadge
          v-if="getCampaignTypeBadge(camp.campaignType)"
          :color="(getCampaignTypeBadge(camp.campaignType)!.color as any)"
          variant="subtle"
          size="xs"
        >
          {{ getCampaignTypeBadge(camp.campaignType)!.label }}
        </UBadge>
        <span class="text-muted tabular-nums">{{ formatCurrency(camp.monthlySpend) }}</span>
      </button>
    </div>
  </div>
</template>
