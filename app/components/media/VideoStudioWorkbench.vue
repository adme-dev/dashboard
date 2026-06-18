<script setup lang="ts">
const props = withDefaults(defineProps<{
  currentTimeSec: number
  durationSec: number
  assetCount?: number
  generationJobCount?: number
  renderJobCount?: number
  generationEnabled?: boolean
  rendering?: boolean
}>(), {
  assetCount: 0,
  generationJobCount: 0,
  renderJobCount: 0,
  generationEnabled: false,
  rendering: false,
})

const emit = defineEmits<{
  (event: 'open-library'): void
  (event: 'add-footage'): void
  (event: 'add-overlay'): void
  (event: 'generate'): void
  (event: 'render'): void
}>()

function fmt(sec: number) {
  const safe = Math.max(0, Math.floor(sec))
  const min = Math.floor(safe / 60)
  return `${min}:${String(safe % 60).padStart(2, '0')}`
}
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-default bg-elevated">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-highlighted">Video Studio</h2>
          <UBadge :label="`${props.assetCount} assets`" size="xs" variant="subtle" color="neutral" />
          <UBadge
            v-if="props.generationJobCount"
            :label="`${props.generationJobCount} AI jobs`"
            size="xs"
            variant="subtle"
            color="primary"
          />
          <UBadge
            v-if="props.renderJobCount"
            :label="`${props.renderJobCount} ${props.renderJobCount === 1 ? 'render' : 'renders'}`"
            size="xs"
            variant="subtle"
            color="neutral"
          />
        </div>
        <p class="mt-0.5 text-xs text-muted">
          {{ fmt(props.currentTimeSec) }} / {{ fmt(props.durationSec) }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UButton icon="i-lucide-film" size="xs" variant="ghost" color="neutral" label="Footage" @click="emit('add-footage')" />
        <UButton icon="i-lucide-shapes" size="xs" variant="ghost" color="neutral" label="Overlay" @click="emit('add-overlay')" />
        <UButton
          icon="i-lucide-sparkles"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Generate"
          :disabled="!props.generationEnabled"
          @click="emit('generate')"
        />
        <UButton icon="i-lucide-library" size="xs" variant="ghost" color="neutral" label="Library" @click="emit('open-library')" />
        <UButton
          icon="i-lucide-clapperboard"
          size="xs"
          variant="soft"
          color="primary"
          label="Render"
          :loading="props.rendering"
          @click="emit('render')"
        />
      </div>
    </header>

    <div class="grid gap-3 p-3 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Library</h3>
        </div>
        <slot name="library" />
      </aside>

      <main class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-monitor-play" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Preview + Prepare</h3>
        </div>
        <slot name="preview" />
      </main>

      <aside class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-wand-sparkles" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Producer</h3>
        </div>
        <slot name="producer" />
      </aside>
    </div>

    <div v-if="$slots.details" class="border-t border-default p-3">
      <slot name="details" />
    </div>
  </section>
</template>
