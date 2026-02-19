<script setup lang="ts">
interface BurndownPoint {
  date: string
  ideal: number
  actual: number
  remaining: number
  completed: number
}

interface Props {
  data: BurndownPoint[]
  height?: number
  showLegend?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
  showLegend: true
})

const maxValue = computed(() => {
  if (!props.data.length) return 1
  return Math.max(
    ...props.data.map(d => Math.max(d.ideal, d.actual || 0)),
    1
  )
})

const chartHeight = computed(() => props.height - 60)

const getY = (value: number) => {
  return chartHeight.value - (value / maxValue.value) * chartHeight.value
}

// Generate SVG path for ideal line
const idealPath = computed(() => {
  if (!props.data.length) return ''
  const points = props.data.map((d, i) => {
    const x = (i / (props.data.length - 1)) * 100
    const y = getY(d.ideal)
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
})

// Generate SVG path for actual line
const actualPath = computed(() => {
  if (!props.data.length) return ''
  const validPoints = props.data.filter(d => d.actual > 0 || d.completed > 0)
  if (!validPoints.length) return ''

  const points = validPoints.map((d, i) => {
    const originalIdx = props.data.indexOf(d)
    const x = (originalIdx / (props.data.length - 1)) * 100
    const y = getY(d.actual || d.remaining)
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
})

const formatDate = (date: string) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Get evenly spaced x-axis labels
const xAxisLabels = computed(() => {
  if (props.data.length <= 7) return props.data
  const step = Math.ceil(props.data.length / 7)
  return props.data.filter((_, i) => i % step === 0)
})
</script>

<template>
  <div class="w-full">
    <!-- Legend -->
    <div v-if="showLegend" class="flex items-center gap-4 mb-4">
      <div class="flex items-center gap-2">
        <div class="w-4 h-0.5 bg-neutral-400" />
        <span class="text-sm text-neutral-500">Ideal</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-0.5 bg-primary-500" />
        <span class="text-sm text-neutral-500">Actual</span>
      </div>
    </div>

    <!-- Chart -->
    <div v-if="data.length" class="relative" :style="{ height: `${height}px` }">
      <svg
        class="w-full"
        :height="chartHeight"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <!-- Grid lines -->
        <line
          v-for="i in 5"
          :key="i"
          x1="0"
          :y1="(i - 1) * 25"
          x2="100"
          :y2="(i - 1) * 25"
          stroke="currentColor"
          stroke-width="0.1"
          class="text-neutral-200 dark:text-neutral-700"
        />

        <!-- Ideal line -->
        <path
          :d="idealPath"
          fill="none"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="2,1"
          class="text-neutral-400"
          vector-effect="non-scaling-stroke"
        />

        <!-- Actual line -->
        <path
          v-if="actualPath"
          :d="actualPath"
          fill="none"
          stroke="currentColor"
          stroke-width="0.8"
          class="text-primary-500"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- X-axis labels -->
      <div class="flex justify-between mt-2 text-xs text-neutral-400">
        <span
          v-for="point in xAxisLabels"
          :key="point.date"
        >
          {{ formatDate(point.date) }}
        </span>
      </div>

      <!-- Y-axis labels -->
      <div class="absolute left-0 top-0 flex flex-col justify-between h-full text-xs text-neutral-400 pr-2" :style="{ height: `${chartHeight}px` }">
        <span>{{ maxValue }}</span>
        <span>{{ Math.round(maxValue / 2) }}</span>
        <span>0</span>
      </div>
    </div>

    <div v-else class="flex items-center justify-center text-neutral-500" :style="{ height: `${height}px` }">
      No data available
    </div>
  </div>
</template>
