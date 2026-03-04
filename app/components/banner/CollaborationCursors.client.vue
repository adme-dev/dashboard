<script setup lang="ts">
const props = defineProps<{
  scale: number
  activeFormatKey: string
}>()

const { remoteCursors } = useBannerRealtime()

// Filter to cursors on the active format
const visibleCursors = computed(() => {
  const result: Array<{ userId: string; userName: string; color: string; x: number; y: number; stale: boolean }> = []
  const now = Date.now()
  for (const [, cursor] of remoteCursors.value) {
    if (cursor.formatKey !== props.activeFormatKey) continue
    const age = now - cursor.lastUpdate
    if (age > 7_000) continue // don't render very stale cursors
    result.push({
      userId: cursor.userId,
      userName: cursor.userName,
      color: cursor.color,
      x: cursor.x * props.scale,
      y: cursor.y * props.scale,
      stale: age > 3_000,
    })
  }
  return result
})
</script>

<template>
  <div class="absolute inset-0 pointer-events-none overflow-hidden" style="z-index: 9993;">
    <div
      v-for="cursor in visibleCursors"
      :key="cursor.userId"
      class="absolute transition-all duration-100 ease-out"
      :class="cursor.stale ? 'opacity-30' : 'opacity-100'"
      :style="{
        left: `${cursor.x}px`,
        top: `${cursor.y}px`,
        transition: 'left 100ms ease-out, top 100ms ease-out, opacity 500ms ease',
      }"
    >
      <!-- Cursor arrow SVG -->
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        class="-ml-0.5 -mt-0.5"
      >
        <path
          d="M1 1L1 15L5.5 11L10 18L12.5 16.5L8 10L14 9L1 1Z"
          :fill="cursor.color"
          stroke="#000"
          stroke-width="1"
          stroke-linejoin="round"
        />
      </svg>
      <!-- Name pill -->
      <div
        class="ml-3 -mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap shadow-md"
        :style="{ backgroundColor: cursor.color }"
      >
        {{ cursor.userName }}
      </div>
    </div>
  </div>
</template>
