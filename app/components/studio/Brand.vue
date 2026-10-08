<script setup lang="ts">
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink :to="to" class="inline-flex shrink-0 items-center gap-3 text-highlighted" aria-label="XeroFlow Page Studio">
    <span class="flex size-9 items-center justify-center rounded-lg bg-inverted text-sm font-semibold text-inverted">XF</span>
    <span class="text-lg font-medium tracking-tight">Page Studio</span>
  </NuxtLink>
</template>
