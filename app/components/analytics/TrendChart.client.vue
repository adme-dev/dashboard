<script setup lang="ts">
const props = defineProps<{
  data: Array<{
    date: string
    value: number
    byPlatform: Record<string, number>
  }>
  metric: string
  loading?: boolean
  resolution?: 'day' | 'week' | 'month'
}>()

const { getPlatformColor, getPlatformLabel, fmtMetric } = useAnalytics()

// Discover platforms
const platforms = computed(() => {
  const set = new Set<string>()
  for (const dp of props.data || []) {
    for (const p of Object.keys(dp.byPlatform || {})) set.add(p)
  }
  return Array.from(set)
})

const visiblePlatforms = ref<Set<string>>(new Set())

watch(platforms, (p) => {
  visiblePlatforms.value = new Set(p)
}, { immediate: true })

function togglePlatform(p: string) {
  const s = new Set(visiblePlatforms.value)
  if (s.has(p)) s.delete(p)
  else s.add(p)
  visiblePlatforms.value = s
}

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
const chartResolution = computed(() => {
  if (props.resolution === 'day' || props.resolution === 'week' || props.resolution === 'month') {
    return props.resolution
  }

  const data = props.data || []
  if (!data.length) return 'day'
  const allMonth = data.every((d) => d.date.length === 7)
  return allMonth ? 'month' : 'day'
})

const showResolutionNotice = computed(() => !props.loading && (props.data || []).length <= 1)

// Max value from visible platforms
const maxValue = computed(() => {
  let max = 0
  for (const dp of props.data || []) {
    for (const [p, v] of Object.entries(dp.byPlatform || {})) {
      if (visiblePlatforms.value.has(p) && v > max) max = v
    }
    // Also include aggregate
    if (dp.value > max) max = dp.value
  }
  return (max || 1) * 1.1
})

function xPos(i: number): number {
  if (dayCount.value <= 1) return marginLeft + chartWidth / 2
  return marginLeft + (i / (dayCount.value - 1)) * chartWidth
}

function yPos(v: number): number {
  return marginTop + chartHeight - (v / maxValue.value) * chartHeight
}

// Build SVG path for a platform
function linePath(platform: string): string {
  const pts = props.data || []
  const points = pts.map((dp, i) => {
    const val = dp.byPlatform[platform] ?? 0
    return `${xPos(i)},${yPos(val)}`
  })
  return 'M' + points.join('L')
}

// Aggregate line
const aggregatePath = computed(() => {
  const pts = props.data || []
  const points = pts.map((dp, i) => `${xPos(i)},${yPos(dp.value)}`)
  return 'M' + points.join('L')
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

const xLabels = computed(() => {
  const pts = props.data || []
  if (pts.length <= 12) return pts.map((p, i) => ({ index: i, label: formatDateShort(p.date) }))
  const step = Math.ceil(pts.length / 8)
  return pts.filter((_, i) => i % step === 0).map((p) => ({ index: (props.data || []).indexOf(p), label: formatDateShort(p.date) }))
})

function formatDateShort(d: string): string {
  if (d.length === 7) return d
  const dt = new Date(d)
  return `${dt.getDate()}/${dt.getMonth() + 1}`
}

// Hover
function onHoverEnter(i: number, evt: MouseEvent) {
  hoverIndex.value = i
  updatePos(evt)
}
function onHoverLeave() { hoverIndex.value = null }
function updatePos(evt: MouseEvent) {
  if (!chartContainer.value) return
  const rect = chartContainer.value.getBoundingClientRect()
  tooltipX.value = evt.clientX - rect.left
  tooltipY.value = evt.clientY - rect.top - 10
}

const hoveredPoint = computed(() => {
  if (hoverIndex.value === null) return null
  return (props.data || [])[hoverIndex.value] || null
})
</script>

<template>
  <div ref="chartContainer" class="relative">
    <div v-if="loading" class="h-56 flex items-center justify-center">
      <USkeleton class="h-48 w-full rounded" />
    </div>
    <div v-else-if="!data?.length" class="h-56 flex items-center justify-center text-muted text-sm">
      No trend data for selected period
    </div>
    <template v-else>
      <div v-if="showResolutionNotice" class="text-xs text-muted">
        Limited trend points in this window (resolution: {{ chartResolution }}). If this window uses monthly data only, connect GA/campaign ingest for day-level trend.
      </div>
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
        <!-- Y labels -->
        <text
          v-for="tick in yTicks"
          :key="'yl' + tick"
          :x="marginLeft - 6"
          :y="yPos(tick) + 3"
          text-anchor="end"
          fill="currentColor" class="text-muted"
          font-size="9"
        >
          {{ fmtMetric(tick, metric) }}
        </text>

        <!-- Platform lines -->
        <path
          v-for="p in platforms"
          :key="p"
          :d="linePath(p)"
          :stroke="getPlatformColor(p)"
          :stroke-opacity="visiblePlatforms.has(p) ? 0.8 : 0.1"
          stroke-width="1.5"
          fill="none"
          stroke-linejoin="round"
          class="transition-all duration-200"
        />

        <!-- Aggregate line (dashed) -->
        <path
          :d="aggregatePath"
          stroke="currentColor"
          stroke-opacity="0.5"
          stroke-width="2"
          stroke-dasharray="4 3"
          fill="none"
        />

        <!-- Hover columns -->
        <g v-for="(dp, i) in (data || [])" :key="'h' + i">
          <rect
            :x="xPos(i) - (dayCount > 1 ? chartWidth / dayCount / 2 : 15)"
            :y="marginTop"
            :width="dayCount > 1 ? chartWidth / dayCount : 30"
            :height="chartHeight"
            fill="transparent"
            @mouseenter="onHoverEnter(i, $event)"
            @mousemove="updatePos"
            @mouseleave="onHoverLeave"
          />
          <!-- Hover line -->
          <line
            v-if="hoverIndex === i"
            :x1="xPos(i)"
            :y1="marginTop"
            :x2="xPos(i)"
            :y2="marginTop + chartHeight"
            stroke="currentColor"
            stroke-opacity="0.15"
            stroke-width="1"
            stroke-dasharray="3 2"
          />
          <!-- Dots on hover -->
          <template v-if="hoverIndex === i">
            <circle
              v-for="p in platforms.filter(p => visiblePlatforms.has(p))"
              :key="'d' + p"
              :cx="xPos(i)"
              :cy="yPos(dp.byPlatform[p] ?? 0)"
              r="3"
              :fill="getPlatformColor(p)"
              class="stroke-[var(--ui-bg)]"
              stroke-width="1"
            />
          </template>
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
          v-if="hoveredPoint && chartContainer"
          class="fixed z-50 bg-elevated border border-default rounded-lg shadow-lg p-3 text-sm pointer-events-none"
          :style="{ left: tooltipX + chartContainer.getBoundingClientRect().left + 'px', top: tooltipY + chartContainer.getBoundingClientRect().top - 100 + 'px' }"
        >
          <p class="text-xs text-muted mb-1.5">{{ hoveredPoint.date }}</p>
          <div class="flex items-center gap-2 text-xs mb-1 font-medium">
            <span class="text-muted">Total:</span>
            <span class="tabular-nums">{{ fmtMetric(hoveredPoint.value, metric) }}</span>
          </div>
          <div v-for="p in platforms.filter(p => visiblePlatforms.has(p))" :key="p" class="flex items-center gap-2 text-xs">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: getPlatformColor(p) }" />
            <span class="text-muted">{{ getPlatformLabel(p) }}</span>
            <span class="ml-auto tabular-nums">{{ fmtMetric(hoveredPoint.byPlatform[p] ?? 0, metric) }}</span>
          </div>
        </div>
      </Teleport>

      <!-- Legend with toggles -->
      <div class="flex flex-wrap gap-3 mt-2 px-1">
        <button
          v-for="p in platforms"
          :key="p"
          class="flex items-center gap-1.5 text-xs cursor-pointer transition-opacity"
          :class="visiblePlatforms.has(p) ? 'opacity-100' : 'opacity-40'"
          @click="togglePlatform(p)"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: getPlatformColor(p) }" />
          {{ getPlatformLabel(p) }}
        </button>
        <span class="flex items-center gap-1.5 text-xs text-muted">
          <span class="w-4 border-t border-dashed border-current" />
          Total
        </span>
      </div>
    </template>
  </div>
</template>
