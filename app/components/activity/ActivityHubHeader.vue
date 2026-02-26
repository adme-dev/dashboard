<script setup lang="ts">
const { minimize, toggleSize, sizeMode } = useActivityHub()

const handleEl = ref<HTMLElement | null>(null)

defineExpose({ handleEl })
</script>

<template>
  <div
    ref="handleEl"
    class="flex items-center justify-between px-4 py-2.5 border-b border-default bg-elevated/50 cursor-grab active:cursor-grabbing select-none"
  >
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-grip-horizontal" class="w-4 h-4 text-muted" />
      <span class="font-semibold text-sm">Activity Hub</span>
    </div>
    <div class="flex items-center gap-0.5">
      <UButton
        :icon="sizeMode === 'compact' ? 'i-lucide-maximize-2' : 'i-lucide-minimize-2'"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="toggleSize"
      />
      <UButton
        icon="i-lucide-minus"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="minimize"
      />
    </div>
  </div>
</template>
