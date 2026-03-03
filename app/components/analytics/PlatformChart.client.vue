<script setup lang="ts">
const props = defineProps<{
  data: Array<{
    date: string
    value: number
    byPlatform: Record<string, number>
  }>
  loading?: boolean
}>()

const { getPlatformColor, getPlatformLabel, fmtCurrency, fmtCompact } = useAnalytics()

// Discover platforms from data
const platforms = computed(() => {
  const set = new Set<string>()
  for (const dp of props.data || []) {
    for (const p of Object.keys(dp.byPlatform || {})) set.add(p)
  }
  return Array.from(set)
})

const hoverIndex = ref<number | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const chartContainer = ref<HTMLDivElement | null>(null)

// Chart dimensions
const marginLeft = 55
const marginTop = 10
const marginRight = 10
const marginBottom = 22
const chartWidth = 700
const chartHeight = 200
const vbW = marginLeft + chartWidth + marginRight
const vbH = marginTop + chartHeight + marginBottom

const dayCount = computed(() => (props.data || []).length)

// Stacked bars
const stackedBars = computed(() => {
  const pts = props.data || []
  return pts.map(dp => {
    let cumulative = 0
    const segments: { platform: string; base: number; top: number; color: string }[] = []
    for (const p of platforms.value) {
      const val = dp.byPlatform[p] || 0
      if (val > 0) {
        segments.push({ platform: p, base: cumulative, top: cumulative + val, color: getPlatformColor(p) })
        cumulative += val
      }
    }
    return { date: dp.date, segments, total: cumulative }
  })
})

const maxValue = computed(() => {
  const m = Math.max(...stackedBars.value.map(b => b.total), 1)
  return m * 1.05
})

// X/Y scale
function xPos(i: number): number {
  if (dayCount.value <= 1) return marginLeft + chartWidth / 2
  return marginLeft + (i / (dayCount.value - 1)) * chartWidth
}

function yPos(v: number): number {
  return marginTop + chartHeight - (v / maxValue.value) * chartHeight
}

const barWidth = computed(() => {
  if (dayCount.value <= 1) return 30
  return Math.max(2, Math.min(20, (chartWidth / dayCount.value) * 0.7))
})

// Y-axis ticks
const yTicks = computed(() => {
  const max = maxValue.value
  const step = niceStep(max, 5)
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return ticks
})

function niceStep(max: number, count: number): number {
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

// X-axis labels
const xLabels = computed(() => {
  const pts = props.data || []
  if (pts.length <= 12) return pts.map((p, i) => ({ index: i, label: formatDateShort(p.date) }))
  const step = Math.ceil(pts.length / 8)
  return pts.filter((_, i) => i % step === 0).map((p, _, arr) => ({ index: (props.data || []).indexOf(p), label: formatDateShort(p.date) }))
})

function formatDateShort(d: string): string {
  if (d.length === 7) return d // month format
  const dt = new Date(d)
  return `${dt.getDate()}/${dt.getMonth() + 1}`
}

// Hover
function onBarEnter(i: number, evt: MouseEvent) {
  hoverIndex.value = i
  updateTooltipPos(evt)
}
function onBarLeave() {
  hoverIndex.value = null
}
function updateTooltipPos(evt: MouseEvent) {
  if (!chartContainer.value) return
  const rect = chartContainer.value.getBoundingClientRect()
  tooltipX.value = evt.clientX - rect.left
  tooltipY.value = evt.clientY - rect.top - 10
}

const hoveredBar = computed(() => {
  if (hoverIndex.value === null) return null
  return stackedBars.value[hoverIndex.value] || null
})
</script>

<template>
  <div ref="chartContainer" class="relative">
    <div v-if="loading" class="h-56 flex items-center justify-center">
      <USkeleton class="h-48 w-full rounded" />
    </div>
    <div v-else-if="!data?.length" class="h-56 flex items-center justify-center text-muted text-sm">
      No data for selected period
    </div>
    <template v-else>
      <svg :viewBox="`0 0 ${vbW} ${vbH}`" class="w-full" preserveAspectRatio="xMidYMid meet">
        <!-- Grid lines -->
        <line
          v-for="tick in yTicks"
          :key="tick"
          :x1="marginLeft"
          :y1="yPos(tick)"
          :x2="marginLeft + chartWidth"
          :y2="yPos(tick)"
          stroke="currentColor"
          stroke-opacity="0.08"
          stroke-width="0.5"
        />
        <!-- Y-axis labels -->
        <text
          v-for="tick in yTicks"
          :key="'yl' + tick"
          :x="marginLeft - 6"
          :y="yPos(tick) + 3"
          text-anchor="end"
          fill="currentColor" class="text-muted"
          font-size="9"
        >
          {{ fmtCompact(tick) }}
        </text>
        <!-- Stacked bars -->
        <g v-for="(bar, i) in stackedBars" :key="i">
          <rect
            v-for="(seg, j) in bar.segments"
            :key="j"
            :x="xPos(i) - barWidth / 2"
            :y="yPos(seg.top)"
            :width="barWidth"
            :height="Math.max(0, yPos(seg.base) - yPos(seg.top))"
            :fill="seg.color"
            :opacity="hoverIndex !== null && hoverIndex !== i ? 0.3 : 0.85"
            rx="1"
            class="transition-opacity duration-150"
          />
          <!-- Hover hit area -->
          <rect
            :x="xPos(i) - barWidth"
            :y="marginTop"
            :width="barWidth * 2"
            :height="chartHeight"
            fill="transparent"
            @mouseenter="onBarEnter(i, $event)"
            @mousemove="updateTooltipPos"
            @mouseleave="onBarLeave"
          />
        </g>
        <!-- X-axis labels -->
        <text
          v-for="lbl in xLabels"
          :key="'xl' + lbl.index"
          :x="xPos(lbl.index)"
          :y="marginTop + chartHeight + 15"
          text-anchor="middle"
          fill="currentColor" class="text-muted"
          font-size="8"
        >
          {{ lbl.label }}
        </text>
      </svg>

      <!-- Tooltip -->
      <Teleport to="body">
        <div
          v-if="hoveredBar && chartContainer"
          class="fixed z-50 bg-elevated border border-default rounded-lg shadow-lg p-3 text-sm pointer-events-none"
          :style="{ left: tooltipX + chartContainer.getBoundingClientRect().left + 'px', top: tooltipY + chartContainer.getBoundingClientRect().top - 80 + 'px' }"
        >
          <p class="text-xs text-muted mb-1.5">{{ hoveredBar.date }}</p>
          <div v-for="seg in [...hoveredBar.segments].reverse()" :key="seg.platform" class="flex items-center gap-2 text-xs">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: seg.color }" />
            <span class="text-muted">{{ getPlatformLabel(seg.platform) }}</span>
            <span class="ml-auto font-medium tabular-nums">{{ fmtCurrency(seg.top - seg.base) }}</span>
          </div>
          <div class="border-t border-default mt-1.5 pt-1.5 flex justify-between text-xs font-medium">
            <span>Total</span>
            <span class="tabular-nums">{{ fmtCurrency(hoveredBar.total) }}</span>
          </div>
        </div>
      </Teleport>

      <!-- Legend -->
      <div class="flex flex-wrap gap-3 mt-2 px-1">
        <div v-for="p in platforms" :key="p" class="flex items-center gap-1.5 text-xs text-muted">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: getPlatformColor(p) }" />
          {{ getPlatformLabel(p) }}
        </div>
      </div>
    </template>
  </div>
</template>
