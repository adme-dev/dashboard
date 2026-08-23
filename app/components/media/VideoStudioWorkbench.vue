<script setup lang="ts">
// Video Studio workbench — a fixed-height, three-column workspace:
//   [ Assets rail | Edit (preview + selection) | Inspector ]
// Each column scrolls on its own; the page never scrolls. Below lg the three
// columns collapse to one and the mode tabs switch between them.
import { computed, onMounted, ref, watch } from 'vue'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
  type VideoRenderFormatId,
} from '~~/app/utils/video/renderFormats'

type StudioMode = 'assets' | 'edit' | 'produce' | 'review'

const props = withDefaults(defineProps<{
  mode?: StudioMode
  assetCount?: number
  generationJobCount?: number
  renderJobCount?: number
  generationEnabled?: boolean
  generationStatusLabel?: string
  generationStatusDetail?: string
  rendering?: boolean
  producerCollapsed?: boolean
}>(), {
  mode: 'edit',
  assetCount: 0,
  generationJobCount: 0,
  renderJobCount: 0,
  generationEnabled: false,
  generationStatusLabel: '',
  generationStatusDetail: '',
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

// Below lg the inspector hosts both Produce and Review, so the mobile switcher
// only needs three stops. 'review' still maps onto the inspector panel.
const mobilePanel = computed({
  get: () => (activeMode.value === 'produce' || activeMode.value === 'review') ? 'produce' : activeMode.value,
  set: (value: string) => { activeMode.value = value as StudioMode },
})
const mobileItems = computed(() => [
  { label: 'Assets', icon: 'i-lucide-library', value: 'assets', badge: props.assetCount ? String(props.assetCount) : undefined },
  { label: 'Edit', icon: 'i-lucide-monitor-play', value: 'edit' },
  { label: 'Inspector', icon: 'i-lucide-panel-right', value: 'produce', badge: props.renderJobCount ? String(props.renderJobCount) : undefined },
])

const generationStatusDetail = computed(() => props.generationStatusDetail || (props.generationEnabled
  ? 'Cloudflare AI Gateway video models are available for this project.'
  : 'Video generation is disabled by account policy or no runnable models are configured.'))

// ─── Column widths: drag the dividers; remembered per browser ───────────────
const COLUMNS_KEY = 'video-studio:columns'
const LIBRARY_RANGE = [220, 520] as const
const INSPECTOR_RANGE = [280, 640] as const
const libraryWidth = ref(300)
const inspectorWidth = ref(360)
let columnDrag: { side: 'library' | 'inspector'; startX: number; startWidth: number } | null = null

function clamp(value: number, [min, max]: readonly [number, number]) {
  return Math.min(max, Math.max(min, value))
}
function onColumnDragStart(side: 'library' | 'inspector', event: PointerEvent) {
  columnDrag = { side, startX: event.clientX, startWidth: side === 'library' ? libraryWidth.value : inspectorWidth.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onColumnDragMove(event: PointerEvent) {
  if (!columnDrag) return
  const delta = event.clientX - columnDrag.startX
  if (columnDrag.side === 'library') libraryWidth.value = clamp(columnDrag.startWidth + delta, LIBRARY_RANGE)
  else inspectorWidth.value = clamp(columnDrag.startWidth - delta, INSPECTOR_RANGE)
}
function onColumnDragEnd() {
  if (!columnDrag) return
  columnDrag = null
  try { localStorage.setItem(COLUMNS_KEY, JSON.stringify({ library: libraryWidth.value, inspector: inspectorWidth.value })) } catch { /* private mode */ }
}
onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null') as { library?: number; inspector?: number } | null
    if (stored?.library) libraryWidth.value = clamp(stored.library, LIBRARY_RANGE)
    if (stored?.inspector) inspectorWidth.value = clamp(stored.inspector, INSPECTOR_RANGE)
  } catch { /* ignore */ }
})

// Below lg the grid is a single column; the widths only apply from lg up (via CSS var + class).
const workspaceStyle = computed(() => ({
  '--vs-library': `${libraryWidth.value}px`,
  '--vs-inspector': `${inspectorWidth.value}px`,
}))
const workspaceGridClass = computed(() => props.producerCollapsed
  ? 'lg:grid-cols-[var(--vs-library)_6px_minmax(0,1fr)]'
  : 'lg:grid-cols-[var(--vs-library)_6px_minmax(0,1fr)_6px_var(--vs-inspector)]')

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

function panelClass(panel: 'assets' | 'edit' | 'produce') {
  return mobilePanel.value === panel ? 'flex' : 'hidden lg:flex'
}

watch(activeMode, (mode) => {
  if ((mode === 'produce' || mode === 'review') && props.producerCollapsed) {
    emit('update:producer-collapsed', false)
  }
})

watch(() => props.mode, (mode) => { localMode.value = mode })
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-elevated">
    <!-- Command bar: sources on the left, output on the right. -->
    <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <div class="flex flex-wrap items-center gap-1 rounded-md border border-default bg-default/50 p-1">
        <UButton icon="i-lucide-film" size="xs" variant="ghost" color="neutral" label="Footage" @click="emit('add-footage')" />
        <UButton icon="i-lucide-shapes" size="xs" variant="ghost" color="neutral" label="Overlay" @click="emit('add-overlay')" />
        <UButton
          icon="i-lucide-sparkles"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Generate"
          :disabled="!props.generationEnabled"
          :title="generationStatusDetail"
          @click="emit('generate')"
        />
        <UButton icon="i-lucide-library" size="xs" variant="ghost" color="neutral" label="Library" @click="emit('open-library')" />
      </div>

      <UTabs
        v-model="mobilePanel"
        :items="mobileItems"
        :content="false"
        size="xs"
        variant="link"
        color="primary"
        class="min-w-0 lg:hidden"
        aria-label="Video Studio panel"
      />

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <UBadge
          v-if="props.generationJobCount"
          :label="`${props.generationJobCount} AI ${props.generationJobCount === 1 ? 'job' : 'jobs'} running`"
          size="xs"
          variant="subtle"
          color="primary"
        />
        <span
          class="hidden items-center gap-1 text-[11px] sm:inline-flex"
          :class="props.generationEnabled ? 'text-muted' : 'text-warning'"
          :title="generationStatusDetail"
        >
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
          {{ props.generationStatusLabel || (props.generationEnabled ? 'AI ready' : 'AI unavailable') }}
        </span>
        <div class="flex items-center gap-1 rounded-md border border-default bg-default/50 p-1">
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
            :label="selectedFormatCount === 1 ? 'Render' : `Render ${selectedFormatCount} formats`"
            :disabled="selectedFormatCount === 0"
            :loading="props.rendering"
            @click="renderSelectedFormats"
          />
        </div>
      </div>
    </header>

    <div :class="['grid min-h-0 flex-1 grid-cols-1', workspaceGridClass]" :style="workspaceStyle">
      <aside :class="['min-h-0 min-w-0 flex-col overflow-hidden', panelClass('assets')]">
        <div class="flex shrink-0 items-center gap-2 border-b border-default px-3 py-2">
          <UIcon name="i-lucide-library" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Assets</h3>
          <UBadge v-if="props.assetCount" :label="String(props.assetCount)" size="xs" variant="subtle" color="neutral" />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <slot name="library" />
        </div>
      </aside>
      <div
        class="group hidden cursor-col-resize touch-none items-stretch justify-center lg:flex"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assets column"
        @pointerdown="onColumnDragStart('library', $event)"
        @pointermove="onColumnDragMove"
        @pointerup="onColumnDragEnd"
        @pointercancel="onColumnDragEnd"
      >
        <span class="w-px bg-default transition group-hover:w-0.5 group-hover:bg-primary" />
      </div>

      <main :class="['min-h-0 min-w-0 flex-col overflow-hidden', panelClass('edit')]">
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <slot name="preview" />
        </div>
      </main>

      <div
        v-if="!props.producerCollapsed"
        class="group hidden cursor-col-resize touch-none items-stretch justify-center lg:flex"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector column"
        @pointerdown="onColumnDragStart('inspector', $event)"
        @pointermove="onColumnDragMove"
        @pointerup="onColumnDragEnd"
        @pointercancel="onColumnDragEnd"
      >
        <span class="w-px bg-default transition group-hover:w-0.5 group-hover:bg-primary" />
      </div>
      <aside
        v-if="!props.producerCollapsed"
        :class="['min-h-0 min-w-0 flex-col overflow-hidden', panelClass('produce')]"
      >
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <slot name="producer" />
        </div>
      </aside>
    </div>

    <div v-if="props.producerCollapsed" class="flex shrink-0 items-center justify-between gap-3 border-t border-default px-3 py-1.5">
      <span class="truncate text-xs text-muted">Inspector hidden</span>
      <UButton
        icon="i-lucide-panel-right-open"
        size="xs"
        variant="ghost"
        color="neutral"
        label="Show inspector"
        @click="emit('update:producer-collapsed', false)"
      />
    </div>
  </section>
</template>
