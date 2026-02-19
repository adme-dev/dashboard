<script setup lang="ts">
interface Props {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  trend?: 'up' | 'down' | 'stable'
  trendValue?: string | number
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

const props = withDefaults(defineProps<Props>(), {
  color: 'primary'
})

const bgColorClass = computed(() => {
  switch (props.color) {
    case 'success': return 'bg-success-100 dark:bg-success-900/20'
    case 'warning': return 'bg-warning-100 dark:bg-warning-900/20'
    case 'error': return 'bg-error-100 dark:bg-error-900/20'
    case 'info': return 'bg-info-100 dark:bg-info-900/20'
    case 'neutral': return 'bg-neutral-100 dark:bg-neutral-900/20'
    default: return 'bg-primary-100 dark:bg-primary-900/20'
  }
})

const iconColorClass = computed(() => {
  switch (props.color) {
    case 'success': return 'text-success-600'
    case 'warning': return 'text-warning-600'
    case 'error': return 'text-error-600'
    case 'info': return 'text-info-600'
    case 'neutral': return 'text-neutral-600'
    default: return 'text-primary-600'
  }
})

const trendColorClass = computed(() => {
  if (props.trend === 'up') return 'text-success-600'
  if (props.trend === 'down') return 'text-error-600'
  return 'text-neutral-500'
})

const trendIcon = computed(() => {
  if (props.trend === 'up') return 'i-lucide-trending-up'
  if (props.trend === 'down') return 'i-lucide-trending-down'
  return 'i-lucide-minus'
})
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-neutral-500">{{ title }}</p>
        <p class="text-2xl font-bold">{{ value }}</p>
      </div>
      <div v-if="icon" class="p-3 rounded-full" :class="bgColorClass">
        <UIcon :name="icon" class="h-6 w-6" :class="iconColorClass" />
      </div>
    </div>
    <div v-if="subtitle || trend" class="mt-2 flex items-center gap-2">
      <span v-if="subtitle" class="text-sm text-neutral-500">{{ subtitle }}</span>
      <span v-if="trend" class="flex items-center gap-1 text-sm" :class="trendColorClass">
        <UIcon :name="trendIcon" class="h-4 w-4" />
        <span v-if="trendValue">{{ trendValue }}</span>
      </span>
    </div>
  </UCard>
</template>
