<script setup lang="ts">
interface DataPoint {
  label: string
  value: number
  color?: string
}

interface Props {
  data: DataPoint[]
  size?: number
  strokeWidth?: number
  showLegend?: boolean
  showTotal?: boolean
  totalLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 160,
  strokeWidth: 24,
  showLegend: true,
  showTotal: true,
  totalLabel: 'Total'
})

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0))

const defaultColors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
]

const segments = computed(() => {
  if (!props.data.length || total.value === 0) return []

  const radius = (props.size - props.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let currentOffset = 0

  return props.data.map((point, idx) => {
    const percentage = point.value / total.value
    const strokeDasharray = `${percentage * circumference} ${circumference}`
    const strokeDashoffset = -currentOffset
    currentOffset += percentage * circumference

    return {
      ...point,
      color: point.color || defaultColors[idx % defaultColors.length],
      strokeDasharray,
      strokeDashoffset,
      percentage: Math.round(percentage * 100)
    }
  })
})

const center = computed(() => props.size / 2)
const radius = computed(() => (props.size - props.strokeWidth) / 2)
</script>

<template>
  <div class="flex items-center gap-6">
    <!-- Chart -->
    <div class="relative" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg :width="size" :height="size" class="transform -rotate-90">
        <!-- Background circle -->
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          :stroke-width="strokeWidth"
          class="stroke-neutral-100 dark:stroke-neutral-800"
        />

        <!-- Data segments -->
        <circle
          v-for="(segment, idx) in segments"
          :key="idx"
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          :stroke="segment.color"
          :stroke-width="strokeWidth"
          :stroke-dasharray="segment.strokeDasharray"
          :stroke-dashoffset="segment.strokeDashoffset"
          stroke-linecap="round"
          class="transition-all duration-500"
        />
      </svg>

      <!-- Center text -->
      <div v-if="showTotal" class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="text-2xl font-bold">{{ total }}</span>
        <span class="text-xs text-neutral-500">{{ totalLabel }}</span>
      </div>
    </div>

    <!-- Legend -->
    <div v-if="showLegend" class="flex flex-col gap-2">
      <div
        v-for="segment in segments"
        :key="segment.label"
        class="flex items-center gap-2"
      >
        <div
          class="w-3 h-3 rounded-full"
          :style="{ backgroundColor: segment.color }"
        />
        <span class="text-sm text-neutral-600 dark:text-neutral-400">
          {{ segment.label }}
        </span>
        <span class="text-sm font-medium">
          {{ segment.value }} ({{ segment.percentage }}%)
        </span>
      </div>
    </div>
  </div>
</template>
