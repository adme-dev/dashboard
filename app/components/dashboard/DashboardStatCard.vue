<template>
  <div class="bg-[var(--ui-bg-elevated)] rounded-lg border border-[var(--ui-border)] p-6">
    <div class="flex items-center gap-4">
      <div
        class="w-12 h-12 rounded-lg flex items-center justify-center"
        :class="iconBgClass"
      >
        <UIcon :name="icon" :class="iconColorClass" class="w-6 h-6" />
      </div>
      <div>
        <p class="text-sm text-[var(--ui-text-muted)]">{{ title }}</p>
        <p class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ value }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: 'blue',
    validator: (value) => ['blue', 'green', 'yellow', 'purple', 'red'].includes(value)
  }
})

const colorMap = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400' },
  green: { bg: 'bg-green-100 dark:bg-green-500/10', icon: 'text-green-600 dark:text-green-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-500/10', icon: 'text-yellow-600 dark:text-yellow-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/10', icon: 'text-purple-600 dark:text-purple-400' },
  red: { bg: 'bg-red-100 dark:bg-red-500/10', icon: 'text-red-600 dark:text-red-400' }
}

const iconBgClass = computed(() => colorMap[props.color].bg)
const iconColorClass = computed(() => colorMap[props.color].icon)
</script>
