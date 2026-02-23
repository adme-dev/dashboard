<template>
  <div class="flex flex-col border-r border-default bg-elevated/25" :style="{ width: width ? `${width}px` : undefined }">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  width?: number
  collapsible?: boolean
  grow?: boolean
}>()
</script>
