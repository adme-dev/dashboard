<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
  type VideoRenderFormatId,
} from '~~/app/utils/video/renderFormats'

const props = withDefaults(defineProps<{
  currentTimeSec: number
  durationSec: number
  assetCount?: number
  generationJobCount?: number
  renderJobCount?: number
  generationEnabled?: boolean
  rendering?: boolean
  producerCollapsed?: boolean
}>(), {
  assetCount: 0,
  generationJobCount: 0,
  renderJobCount: 0,
  generationEnabled: false,
  rendering: false,
  producerCollapsed: false,
})

const emit = defineEmits<{
  (event: 'open-library'): void
  (event: 'add-footage'): void
  (event: 'add-overlay'): void
  (event: 'generate'): void
  (event: 'render', formats: VideoRenderFormatId[]): void
  (event: 'update:producer-collapsed', value: boolean): void
}>()

type StudioStage = 'library' | 'prepare' | 'producer'

const activeStage = ref<StudioStage>('prepare')

const stageItems = computed(() => [
  {
    label: 'Assets',
    icon: 'i-lucide-library',
    value: 'library',
    badge: props.assetCount ? String(props.assetCount) : undefined,
  },
  {
    label: 'Edit',
    icon: 'i-lucide-monitor-play',
    value: 'prepare',
    badge: props.generationJobCount ? String(props.generationJobCount) : undefined,
  },
  {
    label: 'Producer',
    icon: 'i-lucide-wand-sparkles',
    value: 'producer',
    badge: props.renderJobCount ? String(props.renderJobCount) : undefined,
  },
])

const workspaceGridClass = computed(() => props.producerCollapsed
  ? 'grid divide-y divide-default lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:divide-x lg:divide-y-0'
  : 'grid divide-y divide-default lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:divide-x lg:divide-y-0 2xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)_minmax(340px,380px)]')

const selectedFormats = ref<VideoRenderFormatId[]>([...DEFAULT_VIDEO_RENDER_FORMATS])
const selectedFormatCount = computed(() => selectedFormats.value.length)

function toggleFormat(format: VideoRenderFormatId, enabled: boolean) {
  const next = new Set(selectedFormats.value)
  if (enabled) next.add(format)
  else next.delete(format)
  selectedFormats.value = [...next]
}

function renderSelectedFormats() {
  emit('render', normalizeVideoRenderFormats(selectedFormats.value))
}

function stagePanelClass(stage: StudioStage) {
  return activeStage.value === stage ? 'block' : 'hidden lg:block'
}

function fmt(sec: number) {
  const safe = Math.max(0, Math.floor(sec))
  const min = Math.floor(safe / 60)
  return `${min}:${String(safe % 60).padStart(2, '0')}`
}

watch(activeStage, (stage) => {
  if (stage === 'producer' && props.producerCollapsed) {
    emit('update:producer-collapsed', false)
  }
})
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

      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        <div class="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-default bg-default/50 p-1">
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
        </div>

        <div class="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-default bg-default/50 p-1">
          <UPopover :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-sliders-horizontal"
              size="xs"
              variant="ghost"
              color="neutral"
              :label="selectedFormatCount === 1 ? '1 format' : `${selectedFormatCount} formats`"
              title="Choose render formats"
            />
            <template #content>
              <div class="w-72 space-y-3 p-3">
                <div>
                  <p class="text-xs font-medium uppercase text-muted">Render formats</p>
                  <p class="mt-0.5 text-[11px] text-muted">Choose the export variants for the next render.</p>
                </div>
                <div class="grid gap-1.5">
                  <label
                    v-for="format in VIDEO_RENDER_FORMATS"
                    :key="format.id"
                    class="flex cursor-pointer items-center gap-2 rounded-md border border-default bg-elevated px-2 py-1.5"
                  >
                    <UCheckbox
                      :model-value="selectedFormats.includes(format.id)"
                      :aria-label="`Render ${format.label}`"
                      @update:model-value="(checked: boolean | 'indeterminate') => toggleFormat(format.id, checked === true)"
                    />
                    <UIcon :name="format.icon" class="size-3.5 shrink-0 text-muted" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-xs font-medium text-highlighted">{{ format.label }}</span>
                      <span class="block truncate text-[11px] text-muted">{{ format.detail }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </template>
          </UPopover>
          <UButton
            icon="i-lucide-clapperboard"
            size="xs"
            variant="soft"
            color="primary"
            :label="selectedFormatCount === 1 ? 'Render 1 format' : `Render ${selectedFormatCount} formats`"
            :disabled="selectedFormatCount === 0"
            :loading="props.rendering"
            @click="renderSelectedFormats"
          />
        </div>
      </div>
    </header>

    <div class="border-b border-default px-4 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <UTabs
          v-model="activeStage"
          :items="stageItems"
          :content="false"
          size="sm"
          variant="link"
          color="primary"
          class="min-w-0"
          aria-label="Video Studio workspace"
        />
        <div class="hidden items-center gap-2 text-[11px] text-muted md:flex">
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-timer" class="size-3.5" />
            {{ fmt(props.currentTimeSec) }}
          </span>
          <span class="h-3 w-px bg-border" />
          <span>{{ fmt(props.durationSec) }} sequence</span>
        </div>
      </div>
    </div>

    <div :class="workspaceGridClass">
      <aside :class="['min-w-[18rem] resize-x overflow-auto p-3 lg:max-w-[32rem]', stagePanelClass('library')]">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Assets</h3>
        </div>
        <slot name="library" />
      </aside>

      <main :class="['min-w-0 p-3', stagePanelClass('prepare')]">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-monitor-play" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Edit</h3>
        </div>
        <slot name="preview" />
      </main>

      <aside v-if="!props.producerCollapsed" :class="['min-w-0 p-3', stagePanelClass('producer')]">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-wand-sparkles" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Producer</h3>
          <UButton
            icon="i-lucide-panel-right-close"
            size="xs"
            variant="ghost"
            color="neutral"
            class="ml-auto"
            aria-label="Collapse producer rail"
            @click="emit('update:producer-collapsed', true)"
          />
        </div>
        <slot name="producer" />
      </aside>
    </div>

    <div v-if="props.producerCollapsed" class="flex items-center justify-between gap-3 border-t border-default px-4 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-wand-sparkles" class="size-4 text-muted" />
        <span class="truncate text-xs font-medium text-muted">Producer rail collapsed</span>
      </div>
      <UButton
        icon="i-lucide-panel-right-open"
        size="xs"
        variant="soft"
        color="neutral"
        label="Producer"
        @click="emit('update:producer-collapsed', false)"
      />
    </div>

    <div v-if="$slots.details" class="border-t border-default p-3">
      <slot name="details" />
    </div>
  </section>
</template>
