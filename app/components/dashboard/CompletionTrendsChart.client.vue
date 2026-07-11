<script setup lang="ts">
import { format, parseISO } from 'date-fns'

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshCompletionTrends() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/reports/completion-trends', {
      query: { interval: 'day', limit: 14 }
    })
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load completion trends', error)
    status.value = 'error'
  }
}

await refreshCompletionTrends()

const trends = computed(() => (data.value as any)?.trends || [])
const summary = computed(() => (data.value as any)?.summary || {})

// Chart dimensions
const marginLeft = 40
const marginTop = 8
const marginRight = 12
const marginBottom = 22
const chartWidth = 500
const chartHeight = 160
const vbW = marginLeft + chartWidth + marginRight
const vbH = marginTop + chartHeight + marginBottom

const yMax = computed(() => {
  let max = 1
  for (const t of trends.value) {
    if (t.completed > max) max = t.completed
    if (t.created > max) max = t.created
  }
  return max + Math.ceil(max * 0.15)
})

const yScale = (v: number) => chartHeight - (v / yMax.value) * chartHeight

const dayCount = computed(() => trends.value.length)
const slotW = computed(() => dayCount.value > 0 ? chartWidth / dayCount.value : 0)

// Area paths
function buildAreaPath(accessor: (t: any) => number) {
  const pts = trends.value.map((t: any, i: number) => ({
    x: i * slotW.value + slotW.value / 2,
    y: yScale(accessor(t))
  }))
  if (!pts.length) return ''
  const line = pts.map((p: any) => `${p.x},${p.y}`).join(' L')
  return `M${pts[0].x},${chartHeight} L${line} L${pts[pts.length - 1].x},${chartHeight} Z`
}

function buildLinePath(accessor: (t: any) => number) {
  const pts = trends.value.map((t: any, i: number) => ({
    x: i * slotW.value + slotW.value / 2,
    y: yScale(accessor(t))
  }))
  if (!pts.length) return ''
  return 'M' + pts.map((p: any) => `${p.x},${p.y}`).join(' L')
}

const completedArea = computed(() => buildAreaPath((t: any) => t.completed))
const createdArea = computed(() => buildAreaPath((t: any) => t.created))
const completedLine = computed(() => buildLinePath((t: any) => t.completed))
const createdLine = computed(() => buildLinePath((t: any) => t.created))

// X-axis labels
const xTicks = computed(() => {
  const n = dayCount.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil(n / 5)
  const indices: number[] = [0]
  for (let i = step; i < n - 1; i += step) indices.push(i)
  indices.push(n - 1)
  return indices
})

function formatDay(period: string) {
  try {
    return format(parseISO(period), 'MMM d')
  } catch {
    return period
  }
}

// Hover
const hoverIndex = ref<number | null>(null)
const chartContainer = ref<HTMLDivElement | null>(null)

function onMousemove(e: MouseEvent) {
  if (!chartContainer.value || !dayCount.value) return
  const svg = chartContainer.value.querySelector('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * vbW - marginLeft
  const idx = Math.floor(svgX / slotW.value)
  hoverIndex.value = Math.max(0, Math.min(dayCount.value - 1, idx))
}
function onMouseleave() { hoverIndex.value = null }

const hoverData = computed(() => {
  if (hoverIndex.value === null) return null
  const t = trends.value[hoverIndex.value]
  if (!t) return null
  return { period: formatDay(t.period), completed: t.completed, created: t.created }
})

const trendIcon = computed(() => {
  const t = summary.value.trend
  if (t === 'up') return 'i-lucide-trending-up'
  if (t === 'down') return 'i-lucide-trending-down'
  return 'i-lucide-minus'
})
const trendColor = computed(() => {
  const t = summary.value.trend
  if (t === 'up') return 'text-emerald-600 dark:text-emerald-400'
  if (t === 'down') return 'text-red-600 dark:text-red-400'
  return 'text-[var(--ui-text-muted)]'
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-trending-up" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Completion Trends</h3>
        </div>
        <div class="flex items-center gap-1.5">
          <UIcon :name="trendIcon" class="w-4 h-4" :class="trendColor" />
          <span class="text-xs font-medium" :class="trendColor">{{ summary.trendPercentage || 0 }}%</span>
        </div>
      </div>
    </template>

    <div v-if="status === 'pending'" class="h-[200px] flex items-center justify-center">
      <USkeleton class="w-full h-[180px] rounded-lg" />
    </div>

    <div v-else-if="!trends.length" class="h-[200px] flex items-center justify-center">
      <p class="text-sm text-[var(--ui-text-muted)]">No trend data available</p>
    </div>

    <div v-else ref="chartContainer" class="relative">
      <ClientOnly>
        <svg
          class="w-full"
          :viewBox="`0 0 ${vbW} ${vbH}`"
          preserveAspectRatio="xMidYMid meet"
          @mousemove="onMousemove"
          @mouseleave="onMouseleave"
        >
          <g :transform="`translate(${marginLeft}, ${marginTop})`">
            <!-- Grid -->
            <line x1="0" y1="0" :x2="chartWidth" y2="0" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight / 2" :x2="chartWidth" :y2="chartHeight / 2" stroke="currentColor" opacity="0.06" />
            <line x1="0" :y1="chartHeight" :x2="chartWidth" :y2="chartHeight" stroke="currentColor" opacity="0.06" />

            <!-- Created area (behind) -->
            <path :d="createdArea" fill="#f97316" opacity="0.08" />
            <path :d="createdLine" fill="none" stroke="#f97316" stroke-width="1.5" opacity="0.5" />

            <!-- Completed area (front) -->
            <path :d="completedArea" fill="#10b981" opacity="0.12" />
            <path :d="completedLine" fill="none" stroke="#10b981" stroke-width="2" />

            <!-- Dots -->
            <circle
              v-for="(t, i) in trends"
              :key="'c' + i"
              :cx="i * slotW + slotW / 2"
              :cy="yScale(t.completed)"
              r="3"
              fill="#10b981"
              :opacity="hoverIndex === i ? 1 : 0.7"
            />

            <!-- Hover line -->
            <line
              v-if="hoverIndex !== null"
              :x1="hoverIndex * slotW + slotW / 2"
              y1="0"
              :x2="hoverIndex * slotW + slotW / 2"
              :y2="chartHeight"
              stroke="currentColor"
              opacity="0.15"
              stroke-dasharray="3,3"
            />
          </g>

          <!-- Y labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text :x="marginLeft - 6" :y="marginTop + 4" text-anchor="end">{{ yMax }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight / 2 + 4" text-anchor="end">{{ Math.round(yMax / 2) }}</text>
            <text :x="marginLeft - 6" :y="marginTop + chartHeight + 4" text-anchor="end">0</text>
          </g>

          <!-- X labels -->
          <g class="text-[10px] fill-gray-400 dark:fill-gray-500">
            <text
              v-for="idx in xTicks"
              :key="idx"
              :x="marginLeft + idx * slotW + slotW / 2"
              :y="vbH - 4"
              text-anchor="middle"
            >
              {{ formatDay(trends[idx]?.period) }}
            </text>
          </g>
        </svg>

        <!-- Tooltip -->
        <div
          v-if="hoverData"
          class="absolute top-2 right-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg shadow-sm p-2 text-xs pointer-events-none"
        >
          <p class="font-medium text-[var(--ui-text-highlighted)]">{{ hoverData.period }}</p>
          <div class="flex items-center gap-3 mt-1">
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-500" />
              {{ hoverData.completed }} done
            </span>
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-orange-500" />
              {{ hoverData.created }} new
            </span>
          </div>
        </div>

        <template #fallback>
          <USkeleton class="w-full h-[180px] rounded-lg" />
        </template>
      </ClientOnly>

      <!-- Legend -->
      <div class="flex items-center gap-4 text-xs text-[var(--ui-text-muted)] mt-2">
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-emerald-500 rounded" />
          Completed
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-orange-500 rounded" />
          Created
        </span>
        <span class="ml-auto">{{ summary.averageCompletedPerPeriod || 0 }} avg/day</span>
      </div>
    </div>
  </UCard>
</template>
