<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
  type VideoRenderFormatId,
} from '~~/app/utils/video/renderFormats'

type StudioMode = 'assets' | 'edit' | 'produce' | 'review'

const props = withDefaults(defineProps<{
  mode?: StudioMode
  currentTimeSec: number
  durationSec: number
  assetCount?: number
  generationJobCount?: number
  renderJobCount?: number
  generationEnabled?: boolean
  rendering?: boolean
  producerCollapsed?: boolean
}>(), {
  mode: 'edit',
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
  (event: 'update:mode', value: StudioMode): void
  (event: 'update:producer-collapsed', value: boolean): void
}>()

const localMode = ref<StudioMode>(props.mode)

const activeMode = computed({
  get: () => localMode.value,
  set: (value: StudioMode) => {
    localMode.value = value
    emit('update:mode', value)
  },
})

const modeItems = computed(() => [
  {
    label: 'Assets',
    icon: 'i-lucide-library',
    value: 'assets',
    badge: props.assetCount ? String(props.assetCount) : undefined,
  },
  {
    label: 'Edit',
    icon: 'i-lucide-monitor-play',
    value: 'edit',
    badge: props.generationJobCount ? String(props.generationJobCount) : undefined,
  },
  {
    label: 'Produce',
    icon: 'i-lucide-wand-sparkles',
    value: 'produce',
  },
  {
    label: 'Review',
    icon: 'i-lucide-list-checks',
    value: 'review',
    badge: props.renderJobCount ? String(props.renderJobCount) : undefined,
  },
])

const statusItems = computed(() => [
  {
    icon: 'i-lucide-sliders-horizontal',
    label: selectedFormatCount.value === 1 ? '1 format' : `${selectedFormatCount.value} formats`,
  },
  {
    icon: props.generationEnabled ? 'i-lucide-sparkles' : 'i-lucide-sparkles',
    label: props.generationEnabled ? 'AI ready' : 'AI unavailable',
    tone: props.generationEnabled ? 'text-primary' : 'text-warning',
  },
  {
    icon: 'i-lucide-clapperboard',
    label: props.renderJobCount === 1 ? '1 render' : `${props.renderJobCount} renders`,
  },
  {
    icon: 'i-lucide-timer',
    label: `${fmt(props.currentTimeSec)} / ${fmt(props.durationSec)}`,
  },
])

const workspaceGridClass = computed(() => props.producerCollapsed
  ? 'grid min-h-0 divide-y divide-default lg:h-[min(48vh,540px)] lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:divide-x lg:divide-y-0'
  : 'grid min-h-0 divide-y divide-default lg:h-[min(48vh,540px)] lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:divide-x lg:divide-y-0 2xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)_minmax(340px,380px)]')

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

function modePanelClass(mode: StudioMode) {
  return activeMode.value === mode ? 'block' : 'hidden lg:block'
}

function fmt(sec: number) {
  const safe = Math.max(0, Math.floor(sec))
  const min = Math.floor(safe / 60)
  return `${min}:${String(safe % 60).padStart(2, '0')}`
}

watch(activeMode, (mode) => {
  if (mode === 'produce' && props.producerCollapsed) {
    emit('update:producer-collapsed', false)
  }
})

watch(() => props.mode, (mode) => {
  localMode.value = mode
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
          v-model="activeMode"
          :items="modeItems"
          :content="false"
          size="sm"
          variant="link"
          color="primary"
          class="min-w-0"
          aria-label="Video Studio workspace"
        />
        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span
            v-for="item in statusItems"
            :key="item.label"
            class="inline-flex min-w-0 items-center gap-1"
            :class="item.tone"
          >
            <UIcon :name="item.icon" class="size-3.5 shrink-0" />
            <span class="truncate">{{ item.label }}</span>
          </span>
        </div>
      </div>
    </div>

    <div :class="workspaceGridClass">
      <aside :class="['min-h-0 min-w-[18rem] resize-x overflow-auto p-3 lg:max-w-[32rem]', modePanelClass('assets')]">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Assets</h3>
        </div>
        <slot name="library" />
      </aside>

      <main :class="['min-h-0 min-w-0 overflow-y-auto p-3', modePanelClass('edit')]">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-monitor-play" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Edit</h3>
        </div>
        <slot name="preview" />
      </main>

      <aside v-if="!props.producerCollapsed" :class="['min-h-0 min-w-0 overflow-y-auto p-3', modePanelClass('produce')]">
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

      <section :class="['min-h-0 min-w-0 overflow-y-auto p-3', activeMode === 'review' ? 'block lg:hidden' : 'hidden']">
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-list-checks" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Review</h3>
        </div>
        <slot name="review">
          <div class="rounded-md border border-default bg-default/30 p-3">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p class="text-[11px] uppercase text-muted">Render queue</p>
                <p class="mt-0.5 font-medium text-highlighted">{{ props.renderJobCount }} {{ props.renderJobCount === 1 ? 'job' : 'jobs' }}</p>
              </div>
              <div>
                <p class="text-[11px] uppercase text-muted">Formats</p>
                <p class="mt-0.5 font-medium text-highlighted">{{ selectedFormatCount }}</p>
              </div>
              <div>
                <p class="text-[11px] uppercase text-muted">AI state</p>
                <p class="mt-0.5 font-medium text-highlighted">{{ props.generationEnabled ? 'Ready' : 'Unavailable' }}</p>
              </div>
              <div>
                <p class="text-[11px] uppercase text-muted">Sequence</p>
                <p class="mt-0.5 font-medium text-highlighted">{{ fmt(props.durationSec) }}</p>
              </div>
            </div>
          </div>
        </slot>
      </section>
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
