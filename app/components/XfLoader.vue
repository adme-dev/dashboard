<template>
  <div class="flex flex-col items-center justify-center gap-4">
    <!-- XF Icon Badge -->
    <div
      class="bg-white dark:bg-white rounded-xl flex items-center justify-center animate-[xf-pulse_2s_ease-in-out_infinite]"
      :class="badgeClass"
    >
      <span class="text-[#121317] font-bold tracking-tight" :class="textClass">XF</span>
    </div>

    <!-- Dots -->
    <div class="flex gap-1.5">
      <div
        v-for="i in 3"
        :key="i"
        class="rounded-full bg-neutral-400/40 dark:bg-white/30 animate-[xf-dot_1.2s_ease-in-out_infinite]"
        :class="dotClass"
        :style="{ animationDelay: `${(i - 1) * 0.2}s` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
}>(), {
  size: 'md',
})

const badgeClass = computed(() => ({
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-11 h-11',
  lg: 'w-14 h-14',
}[props.size]))

const textClass = computed(() => ({
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-xl',
}[props.size]))

const dotClass = computed(() => ({
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
  lg: 'w-1.5 h-1.5',
}[props.size]))
</script>

<style scoped>
@keyframes xf-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.85; }
}
@keyframes xf-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
</style>
