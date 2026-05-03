<script setup lang="ts">
/**
 * Inline-SVG pacing chart for the Get Out page. Three lines:
 *   • Linear daily-pace target (straight line — the trajectory needed to hit target by end of month)
 *   • Prior-month cumulative invoicing (dotted, so this-month-vs-last is visible)
 *   • Current-month cumulative invoicing up to today (solid)
 *
 * Hover-free for now — keeps the file under 200 lines and works on touch.
 * If the chart needs interactive tooltips later, swap to Unovis (already
 * in the project) for the same data shape.
 */

interface Point {
  day: number
  currentCumulative: number | null
  priorCumulative: number | null
  targetLine: number
}

const props = withDefaults(
  defineProps<{
    points: Point[]
    target: number
    daysInMonth: number
    dayOfMonth: number
    height?: number
  }>(),
  { height: 220 },
)

const padding = { top: 16, right: 12, bottom: 28, left: 56 }

// Vertical scale: top of chart = max(target, current peak, prior peak) × 1.05
const yMax = computed(() => {
  let m = props.target
  for (const p of props.points) {
    if (p.currentCumulative != null && p.currentCumulative > m) m = p.currentCumulative
    if (p.priorCumulative != null && p.priorCumulative > m) m = p.priorCumulative
    if (p.targetLine > m) m = p.targetLine
  }
  return m * 1.05 || 1
})

function fmt(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${Math.round(value)}`
}

function buildPath(width: number, key: 'currentCumulative' | 'priorCumulative' | 'targetLine'): string {
  if (props.points.length < 2) return ''
  const innerW = width - padding.left - padding.right
  const innerH = props.height - padding.top - padding.bottom
  const stepX = innerW / (props.daysInMonth - 1)
  const parts: string[] = []
  for (const p of props.points) {
    const value = p[key]
    if (value == null) continue
    const x = padding.left + (p.day - 1) * stepX
    const y = padding.top + innerH - (value / yMax.value) * innerH
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return parts.join(' ')
}

// Today marker — vertical guide at dayOfMonth
const todayX = (width: number): number => {
  const innerW = width - padding.left - padding.right
  const stepX = innerW / (props.daysInMonth - 1)
  return padding.left + (props.dayOfMonth - 1) * stepX
}

// Y-axis ticks at 0/25/50/75/100% of yMax
const yTicks = computed(() => {
  const ticks = []
  for (let i = 0; i <= 4; i++) {
    const value = (yMax.value * i) / 4
    ticks.push({ value, ratio: i / 4 })
  }
  return ticks
})

const chartWidth = ref(640)
const containerRef = ref<HTMLElement | null>(null)
onMounted(() => {
  if (!containerRef.value) return
  const update = () => {
    chartWidth.value = containerRef.value?.clientWidth ?? 640
  }
  update()
  const ro = new ResizeObserver(update)
  ro.observe(containerRef.value)
  onBeforeUnmount(() => ro.disconnect())
})

const innerHForLine = computed(() => props.height - padding.top - padding.bottom)
</script>

<template>
  <div ref="containerRef" class="w-full">
    <svg
      :width="chartWidth"
      :height="height"
      :viewBox="`0 0 ${chartWidth} ${height}`"
      role="img"
      aria-label="Cumulative invoicing pacing chart"
    >
      <!-- Y gridlines + labels -->
      <g class="text-muted">
        <g v-for="(tick, i) in yTicks" :key="`tick-${i}`">
          <line
            :x1="padding.left"
            :y1="padding.top + innerHForLine * (1 - tick.ratio)"
            :x2="chartWidth - padding.right"
            :y2="padding.top + innerHForLine * (1 - tick.ratio)"
            stroke="currentColor"
            stroke-opacity="0.1"
            stroke-dasharray="2,3"
          />
          <text
            :x="padding.left - 6"
            :y="padding.top + innerHForLine * (1 - tick.ratio) + 4"
            font-size="10"
            text-anchor="end"
            fill="currentColor"
          >{{ fmt(tick.value) }}</text>
        </g>
      </g>

      <!-- X axis day labels (1, 5, 10, ..., daysInMonth) -->
      <g class="text-muted">
        <text
          v-for="d in [1, 5, 10, 15, 20, 25, daysInMonth]"
          :key="`xlabel-${d}`"
          :x="padding.left + ((d - 1) / (daysInMonth - 1)) * (chartWidth - padding.left - padding.right)"
          :y="height - 8"
          font-size="10"
          text-anchor="middle"
          fill="currentColor"
        >{{ d }}</text>
      </g>

      <!-- Target line — straight, dashed, neutral -->
      <path
        :d="buildPath(chartWidth, 'targetLine')"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-dasharray="4,4"
      />

      <!-- Prior month — dotted, slate -->
      <path
        :d="buildPath(chartWidth, 'priorCumulative')"
        fill="none"
        stroke-width="1.5"
        stroke-dasharray="2,3"
        class="stroke-slate-400 dark:stroke-slate-500"
      />

      <!-- Current month — solid, primary -->
      <path
        :d="buildPath(chartWidth, 'currentCumulative')"
        fill="none"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="stroke-emerald-500 dark:stroke-emerald-400"
      />

      <!-- Today marker -->
      <line
        :x1="todayX(chartWidth)"
        :y1="padding.top"
        :x2="todayX(chartWidth)"
        :y2="height - padding.bottom"
        stroke="currentColor"
        stroke-opacity="0.3"
        stroke-width="1"
        stroke-dasharray="2,2"
      />
      <text
        :x="todayX(chartWidth)"
        :y="padding.top - 4"
        font-size="10"
        text-anchor="middle"
        fill="currentColor"
        class="text-muted"
      >Today</text>
    </svg>

    <!-- Legend -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
      <span class="flex items-center gap-1.5">
        <span class="w-4 h-0.5 bg-emerald-500 dark:bg-emerald-400" />
        <span>This month</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="w-4 h-0.5 bg-slate-400 dark:bg-slate-500" style="background-image: repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)" />
        <span class="text-muted">Last month</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="w-4 h-0.5" style="background-image: repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px)" />
        <span class="text-muted">Daily-pace target</span>
      </span>
    </div>
  </div>
</template>
