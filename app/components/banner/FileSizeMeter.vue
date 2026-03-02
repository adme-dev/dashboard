<script setup lang="ts">
const props = withDefaults(defineProps<{
  total: number // bytes
  compact?: boolean
}>(), {
  compact: false,
})

const IAB_GREEN = 100 * 1024 // 100KB
const IAB_YELLOW = 150 * 1024 // 150KB

const fraction = computed(() => Math.min(1, props.total / IAB_YELLOW))

const color = computed(() => {
  if (props.total < IAB_GREEN) return 'green'
  if (props.total < IAB_YELLOW) return 'yellow'
  return 'red'
})

const barClasses = computed(() => {
  switch (color.value) {
    case 'green': return 'bg-emerald-500'
    case 'yellow': return 'bg-amber-500'
    case 'red': return 'bg-red-500'
  }
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(0)}KB`
}
</script>

<template>
  <div class="flex items-center gap-1.5" :class="compact ? '' : 'min-w-[100px]'">
    <div class="flex-1 h-1.5 bg-(--ui-bg) rounded-full overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="barClasses"
        :style="{ width: `${fraction * 100}%` }"
      />
    </div>
    <span class="text-[10px] font-mono shrink-0" :class="{
      'text-emerald-500': color === 'green',
      'text-amber-500': color === 'yellow',
      'text-red-500': color === 'red',
    }">
      {{ formatBytes(total) }}
    </span>
    <UIcon
      v-if="color === 'red'"
      name="i-lucide-alert-triangle"
      class="w-3 h-3 text-red-500 shrink-0"
    />
  </div>
</template>
