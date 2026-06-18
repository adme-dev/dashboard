<script setup lang="ts">
import { computed } from 'vue'
import type { VideoStudioClipInspectorSummary } from '~~/app/utils/video/clipInspector'

const props = withDefaults(defineProps<{
  clip: VideoStudioClipInspectorSummary
  canSplit?: boolean
}>(), {
  canSplit: true,
})

const emit = defineEmits<{
  (event: 'split'): void
  (event: 'delete'): void
}>()

const kindIcon = computed(() => {
  switch (props.clip.kind) {
    case 'video': return 'i-lucide-film'
    case 'overlay': return 'i-lucide-shapes'
    case 'caption': return 'i-lucide-subtitles'
    default: return 'i-lucide-audio-lines'
  }
})
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex items-start gap-2">
        <UIcon :name="kindIcon" class="mt-0.5 size-4 shrink-0 text-primary" />
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase text-muted">Selected clip</p>
          <h3 class="truncate text-sm font-semibold text-highlighted">{{ props.clip.label }}</h3>
          <p class="mt-0.5 truncate text-xs text-muted">{{ props.clip.trackName }} · {{ props.clip.sourceLabel }}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UButton icon="i-lucide-scissors" size="xs" variant="soft" color="neutral" label="Split" :disabled="!props.canSplit" @click="emit('split')" />
        <UButton icon="i-lucide-trash-2" size="xs" variant="soft" color="error" label="Delete" @click="emit('delete')" />
      </div>
    </div>

    <dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div
        v-for="detail in props.clip.details"
        :key="`${detail.label}:${detail.value}`"
        class="min-w-0 rounded-md border border-default bg-default/30 px-2 py-1.5"
      >
        <dt class="truncate text-[10px] uppercase text-muted">{{ detail.label }}</dt>
        <dd class="truncate text-xs font-medium text-highlighted">{{ detail.value }}</dd>
      </div>
    </dl>
  </section>
</template>
