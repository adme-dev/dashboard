<script setup lang="ts">
import type { BannerCatalogPreset } from '~/utils/banner-format-catalog'

const props = defineProps<{ preset: BannerCatalogPreset }>()
defineEmits<{ select: [] }>()
const previewFormats = computed(() => {
  const sorted = [...props.preset.formats].sort((a, b) => a.w / a.h - b.w / b.h)
  return sorted.length < 3 ? sorted : [sorted[0]!, sorted[Math.floor(sorted.length / 2)]!, sorted[sorted.length - 1]!]
})
function shapeSize(w: number, h: number) {
  const scale = Math.min(70 / w, 62 / h)
  return { width: Math.max(8, Math.round(w * scale)) + 'px', height: Math.max(8, Math.round(h * scale)) + 'px' }
}
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    class="w-full flex-col items-stretch gap-0 overflow-hidden p-0 text-left"
    :aria-label="preset.name + (preset.formats.length > 1 ? ', ' + preset.formats.length + ' sizes' : ', ' + preset.formats[0]!.w + ' by ' + preset.formats[0]!.h + ' pixels')"
    @click="$emit('select')"
  >
    <div class="flex h-28 items-center justify-center gap-2 bg-elevated/60 px-3" aria-hidden="true">
      <div
        v-for="(format, index) in previewFormats"
        :key="index"
        class="flex max-w-[30%] shrink-0 flex-col justify-center gap-1 overflow-hidden rounded border border-default bg-default p-1.5 shadow-sm"
        :style="shapeSize(format.w, format.h)"
      >
        <UIcon v-if="preset.category === 'video'" name="i-lucide-play" class="mx-auto size-4 text-primary" />
        <template v-else>
          <div class="h-1 w-3/4 rounded-sm bg-muted/30" />
          <div class="h-1 w-full rounded-sm bg-muted/20" />
          <div class="mt-0.5 h-2 w-1/2 rounded-sm bg-primary/70" />
        </template>
      </div>
    </div>
    <div class="min-h-20 px-3 py-3">
      <p class="text-sm font-medium text-highlighted">
        {{ preset.name }}
      </p>
      <p class="mt-1 text-xs text-muted">
        {{ preset.formats.length > 1 ? preset.formats.length + ' sizes' : preset.formats[0]!.w + ' × ' + preset.formats[0]!.h + ' px' }}
      </p>
    </div>
  </UButton>
</template>
