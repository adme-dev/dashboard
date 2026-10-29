<script setup lang="ts">
const props = defineProps<{ html: string, width: number, height: number, title: string }>()
const container = ref<HTMLElement | null>(null)
const { width: availableWidth } = useElementSize(container)
const scale = computed(() => availableWidth.value / props.width)
</script>

<template>
  <div ref="container" class="relative w-full overflow-hidden bg-black" :style="{ aspectRatio: `${width} / ${height}` }">
    <iframe :srcdoc="html" :title="title" sandbox="allow-scripts" class="absolute left-0 top-0 origin-top-left border-0" :width="width" :height="height" :style="{ transform: `scale(${scale})` }" />
  </div>
</template>
