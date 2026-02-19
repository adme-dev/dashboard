<script setup lang="ts">
interface TrendPoint {
  period: string
  value: number
  label?: string
}

interface Props {
  data: TrendPoint[]
  height?: number
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  showLabels?: boolean
  showValues?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: 200,
  color: 'primary',
  showLabels: true,
  showValues: true
})

const maxValue = computed(() => {
  if (!props.data.length) return 1
  return Math.max(...props.data.map(d => d.value), 1)
})

const barColor = computed(() => {
  switch (props.color) {
    case 'success': return 'bg-success-500'
    case 'warning': return 'bg-warning-500'
    case 'error': return 'bg-error-500'
    case 'info': return 'bg-info-500'
    default: return 'bg-primary-500'
  }
})

const formatLabel = (period: string) => {
  const date = new Date(period)
  if (isNaN(date.getTime())) return period
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="w-full">
    <div
      v-if="data.length"
      class="flex items-end gap-1"
      :style="{ height: `${height}px` }"
    >
      <div
        v-for="(point, idx) in data"
        :key="idx"
        class="flex-1 flex flex-col items-center gap-1"
      >
        <!-- Value label -->
        <span v-if="showValues" class="text-xs text-neutral-500">
          {{ point.value }}
        </span>

        <!-- Bar -->
        <div
          class="w-full rounded-t transition-all duration-300"
          :class="barColor"
          :style="{
            height: `${(point.value / maxValue) * (height - 40)}px`,
            minHeight: point.value > 0 ? '4px' : '0'
          }"
        />

        <!-- Period label -->
        <span v-if="showLabels" class="text-[10px] text-neutral-400 truncate w-full text-center">
          {{ formatLabel(point.period) }}
        </span>
      </div>
    </div>
    <div v-else class="flex items-center justify-center text-neutral-500" :style="{ height: `${height}px` }">
      No data available
    </div>
  </div>
</template>
