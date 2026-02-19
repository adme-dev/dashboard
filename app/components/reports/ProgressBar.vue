<script setup lang="ts">
interface Props {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

const props = withDefaults(defineProps<Props>(), {
  max: 100,
  showValue: true,
  size: 'md',
  color: 'primary'
})

const percentage = computed(() => {
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})

const heightClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'h-1.5'
    case 'lg': return 'h-4'
    default: return 'h-2'
  }
})

const colorClass = computed(() => {
  switch (props.color) {
    case 'success': return 'bg-success-500'
    case 'warning': return 'bg-warning-500'
    case 'error': return 'bg-error-500'
    case 'info': return 'bg-info-500'
    case 'neutral': return 'bg-neutral-500'
    default: return 'bg-primary-500'
  }
})
</script>

<template>
  <div class="w-full">
    <div v-if="label || showValue" class="flex items-center justify-between mb-1">
      <span v-if="label" class="text-sm text-neutral-600 dark:text-neutral-400">{{ label }}</span>
      <span v-if="showValue" class="text-sm font-medium">{{ Math.round(percentage) }}%</span>
    </div>
    <div class="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden" :class="heightClass">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="colorClass"
        :style="{ width: `${percentage}%` }"
      />
    </div>
  </div>
</template>
