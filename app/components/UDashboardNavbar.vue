<template>
  <div class="flex items-center justify-between px-4 py-3 border-b border-default min-h-[57px]">
    <div class="flex items-center gap-3">
      <slot name="leading" />
      <h2 v-if="title" class="font-semibold text-highlighted">{{ title }}</h2>
      <slot />
    </div>
    <div class="flex items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>
