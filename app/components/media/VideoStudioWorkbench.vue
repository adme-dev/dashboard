<script setup lang="ts">
// The desktop preview stays mounted beside the active workspace.
// Each pane owns scrolling; mobile navigation selects the visible pane.
import { computed, onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
  type VideoRenderFormatId
} from '~~/app/utils/video/renderFormats'

type StudioMode = 'assets' | 'edit' | 'produce' | 'review'

const props = withDefaults(defineProps<{
  mode?: StudioMode
  assetCount?: number
  generationJobCount?: number
  renderJobCount?: number
  generationEnabled?: boolean
  generationStatusDetail?: string
  rendering?: boolean
  producerCollapsed?: boolean
  prepareEnabled?: boolean
}>(), {
  mode: 'edit',
  assetCount: 0,
  generationJobCount: 0,
  renderJobCount: 0,
  generationEnabled: false,
  generationStatusDetail: '',
  rendering: false,
  producerCollapsed: false,
  prepareEnabled: false
})

const emit = defineEmits<{
  (event: 'open-library' | 'add-footage' | 'add-overlay' | 'generate'): void
  (event: 'render', formats: VideoRenderFormatId[]): void
  (event: 'update:mode', value: StudioMode): void
  (event: 'update:producer-collapsed', value: boolean): void
}>()

type WorkspaceView = 'preview' | 'storyboard' | 'library' | 'prepare' | 'history' | 'guide'
const workspaceView = defineModel<WorkspaceView>('workspaceView', { default: 'preview' })
const workspaceItems = computed(() => [
  { label: 'Storyboard', icon: 'i-lucide-panels-top-left', value: 'storyboard' },
  { label: 'Preview', icon: 'i-lucide-monitor-play', value: 'preview' },
  { label: 'Project assets', icon: 'i-lucide-library', value: 'library', badge: props.assetCount ? String(props.assetCount) : undefined },
  ...(props.prepareEnabled ? [{ label: 'Prepare', icon: 'i-lucide-eraser', value: 'prepare' }] : []),
  { label: 'History', icon: 'i-lucide-history', value: 'history', badge: props.renderJobCount ? String(props.renderJobCount) : undefined },
  { label: 'How it works', icon: 'i-lucide-circle-help', value: 'guide' }
])
// Prepare paints on the main stage, so it takes the whole workspace: no preview
// beside it, and the inspector steps aside on desktop until asked for.
const preparing = computed(() => workspaceView.value === 'prepare')
const prepareMounted = ref(false)
const prepareInspectorShown = ref(false)
const inspectorHiddenForPrepare = computed(() => preparing.value && !prepareInspectorShown.value && !props.producerCollapsed)
watch(preparing, (active) => {
  if (active) prepareMounted.value = true
  else prepareInspectorShown.value = false
}, { immediate: true })
const expandedTarget = ref<HTMLElement | null>(null)
const frameArea = ref<HTMLElement | null>(null)
const { height: frameHeight } = useElementSize(frameArea)

const localMode = ref<StudioMode>(props.mode)
const activeMode = computed({
  get: () => localMode.value,
  set: (value: StudioMode) => {
    localMode.value = value
    emit('update:mode', value)
  }
})

// Desktop keeps the inspector open beside the workspace. Phones navigate to it in the same tab strip.
const mobilePanel = computed(() => activeMode.value === 'produce' ? 'produce' : 'edit')
const mobileItems = computed(() => [
  workspaceItems.value[1]!,
  workspaceItems.value[0]!,
  { label: 'Inspector', icon: 'i-lucide-panel-right', value: 'produce' },
  ...workspaceItems.value.slice(2)
])
const workspaceTabStyle = { indicator: 'hidden', trigger: 'data-[state=active]:bg-primary data-[state=active]:text-inverted transition-none' }
function selectMobileWorkspace(view: string | number) {
  if (view === 'produce') activeMode.value = 'produce'
  else selectWorkspace(view)
}

const generationStatusDetail = computed(() => props.generationStatusDetail || (props.generationEnabled
  ? 'Cloudflare AI Gateway video models are available for this project.'
  : 'Video generation is disabled by account policy or no runnable models are configured.'))

// ─── Column widths: drag the dividers; remembered per browser ───────────────
const COLUMNS_KEY = 'video-studio:columns'
const INSPECTOR_RANGE = [280, 640] as const
const inspectorWidth = ref(310)
let columnDrag: { startX: number, startWidth: number } | null = null

function clamp(value: number, [min, max]: readonly [number, number]) {
  return Math.min(max, Math.max(min, value))
}
function onColumnDragStart(event: PointerEvent) {
  columnDrag = { startX: event.clientX, startWidth: inspectorWidth.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onColumnDragMove(event: PointerEvent) {
  if (!columnDrag) return
  const delta = event.clientX - columnDrag.startX
  inspectorWidth.value = clamp(columnDrag.startWidth + delta, INSPECTOR_RANGE)
}
function onColumnDragEnd() {
  if (!columnDrag) return
  columnDrag = null
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify({ inspector: inspectorWidth.value }))
  } catch { /* private mode */ }
}
onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null') as { library?: number, inspector?: number } | null
    if (stored?.inspector) inspectorWidth.value = clamp(stored.inspector, INSPECTOR_RANGE)
  } catch { /* ignore */ }
})

// Below lg the grid is a single column; the widths only apply from lg up (via CSS var + class).
const workspaceStyle = computed(() => ({
  '--vs-inspector': `min(${inspectorWidth.value}px, 38%)`
}))
const workspaceGridClass = computed(() => props.producerCollapsed || inspectorHiddenForPrepare.value
  ? 'lg:grid-cols-1'
  : 'lg:grid-cols-[var(--vs-inspector)_6px_minmax(0,1fr)]')

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
  // Phones reach the inspector through the tab strip, so Prepare only hides it from lg up.
  if (panel === 'produce' && inspectorHiddenForPrepare.value) return mobilePanel.value === panel ? 'flex lg:hidden' : 'hidden'
  return mobilePanel.value === panel ? 'flex' : 'hidden lg:flex'
}

function selectWorkspace(view: string | number) {
  workspaceView.value = view as WorkspaceView
  // Only explicit tab navigation leaves the mobile inspector. Producer actions
  // may change the background workspace while keeping their controls visible.
  if (activeMode.value === 'produce') activeMode.value = 'edit'
}

watch(activeMode, (mode) => {
  if (mode === 'review') workspaceView.value = 'history'
  else if (mode === 'assets') workspaceView.value = 'library'
  if ((mode === 'produce' || mode === 'review') && props.producerCollapsed) {
    emit('update:producer-collapsed', false)
  }
}, { immediate: true })

watch(() => props.mode, (mode) => {
  localMode.value = mode
})
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-elevated">
    <slot name="navigation" />
    <!-- Creation controls stay separate from explicit output actions. -->
    <header class="flex shrink-0 flex-wrap items-center gap-1 border-b border-default px-2 py-1 sm:gap-2 sm:px-3 sm:py-2">
      <UDropdownMenu
        :items="[
          { label: 'Add footage', icon: 'i-lucide-film', onSelect: () => emit('add-footage') },
          { label: 'Add overlay', icon: 'i-lucide-shapes', onSelect: () => emit('add-overlay') },
          { label: 'Saved videos', icon: 'i-lucide-library', onSelect: () => emit('open-library') },
          ...(props.prepareEnabled ? [{ label: 'Prepare asset', icon: 'i-lucide-eraser', onSelect: () => selectWorkspace('prepare') }] : [])
        ]"
      >
        <UButton
          class="sm:hidden"
          label="Add"
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
        />
      </UDropdownMenu>
      <UButton
        class="sm:hidden"
        label="Generate"
        icon="i-lucide-sparkles"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!props.generationEnabled"
        @click="emit('generate')"
      />
      <div class="hidden flex-wrap items-center gap-1 rounded-md border border-default bg-default/50 p-1 sm:flex">
        <UButton
          icon="i-lucide-film"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Footage"
          @click="emit('add-footage')"
        />
        <UButton
          icon="i-lucide-shapes"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Overlay"
          @click="emit('add-overlay')"
        />
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
        <UButton
          v-if="props.prepareEnabled"
          icon="i-lucide-eraser"
          size="xs"
          :variant="preparing ? 'soft' : 'ghost'"
          :color="preparing ? 'primary' : 'neutral'"
          label="Prepare"
          title="Erase, lift or mask part of an asset"
          @click="selectWorkspace('prepare')"
        />
        <UButton
          icon="i-lucide-library"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Saved videos"
          @click="emit('open-library')"
        />
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <UBadge
          v-if="props.generationJobCount"
          :label="`${props.generationJobCount} AI ${props.generationJobCount === 1 ? 'job' : 'jobs'} running`"
          size="xs"
          variant="subtle"
          color="primary"
        />
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
                  <p class="text-xs font-medium uppercase text-muted">
                    Render formats
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted">
                    Choose the export variants for the next render.
                  </p>
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
    <div class="shrink-0 overflow-x-auto border-b border-default px-1 py-1 lg:hidden">
      <UTabs
        :model-value="mobilePanel === 'produce' ? 'produce' : workspaceView"
        :items="mobileItems"
        :content="false"
        :ui="workspaceTabStyle"
        size="xs"
        variant="pill"
        class="w-max"
        aria-label="Mobile project workspace"
        @update:model-value="selectMobileWorkspace"
      />
    </div>

    <div :class="['grid min-h-0 flex-1 grid-cols-1', workspaceGridClass]" :style="workspaceStyle">
      <aside v-if="!props.producerCollapsed" :class="['min-h-0 min-w-0 flex-col overflow-hidden border-r border-default bg-default/40', panelClass('produce')]">
        <div class="min-h-0 flex-1 overflow-hidden">
          <slot name="producer" />
        </div>
      </aside>
      <div
        v-if="!props.producerCollapsed"
        :class="['group hidden cursor-col-resize touch-none items-stretch justify-center', inspectorHiddenForPrepare ? '' : 'lg:flex']"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector column"
        @pointerdown="onColumnDragStart"
        @pointermove="onColumnDragMove"
        @pointerup="onColumnDragEnd"
        @pointercancel="onColumnDragEnd"
      >
        <span class="w-px bg-default transition group-hover:w-0.5 group-hover:bg-primary" />
      </div>
      <main :class="['min-h-0 min-w-0 flex-col overflow-hidden bg-default', mobilePanel === 'produce' ? 'hidden lg:flex' : 'flex']">
        <div class="hidden shrink-0 items-center gap-3 overflow-x-auto border-b border-default px-4 py-2 lg:flex">
          <UTabs
            :model-value="workspaceView"
            :items="workspaceItems"
            :ui="workspaceTabStyle"
            :content="false"
            size="sm"
            variant="pill"
            class="w-max min-w-0"
            aria-label="Project workspace"
            @update:model-value="selectWorkspace"
          />
          <UButton
            v-if="preparing && !props.producerCollapsed"
            class="ml-auto shrink-0"
            :icon="prepareInspectorShown ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
            size="xs"
            variant="ghost"
            color="neutral"
            :label="prepareInspectorShown ? 'Hide inspector' : 'Show inspector'"
            @click="prepareInspectorShown = !prepareInspectorShown"
          />
        </div>
        <div
          class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden"
          :class="{ 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]': workspaceView !== 'preview' && !preparing }"
        >
          <div
            data-workspace-pane="preview"
            class="min-h-0 min-w-0 flex-col overflow-y-auto bg-default p-2 sm:p-3"
            :class="workspaceView === 'preview' ? 'flex' : preparing ? 'hidden' : 'hidden border-r border-default lg:flex'"
          >
            <div class="flex h-full min-h-36 shrink-0 flex-col gap-1.5">
              <div class="flex shrink-0 items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-highlighted" title="Effects are approximated until render">
                  Edit preview
                </h4>
                <UModal
                  fullscreen
                  title="Expanded preview"
                  :transition="false"
                  :close="{ 'aria-label': 'Exit expanded preview' }"
                  :ui="{ body: 'flex min-h-0 flex-1 flex-col p-2 sm:p-3' }"
                >
                  <UButton
                    icon="i-lucide-maximize-2"
                    aria-label="Expand preview"
                    title="Expand preview"
                    color="neutral"
                    size="xs"
                    variant="ghost"
                  />
                  <template #body>
                    <div ref="expandedTarget" data-expanded-preview class="flex min-h-0 flex-1 flex-col gap-2" />
                  </template>
                </UModal>
              </div>
              <Teleport :to="expandedTarget ?? 'body'" :disabled="!expandedTarget">
                <div ref="frameArea" class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-black">
                  <slot name="preview" :max-height="frameHeight || 320" />
                </div>
                <slot name="transport" />
              </Teleport>
            </div>
            <slot name="clip-tools" />
          </div>
          <div v-show="workspaceView === 'storyboard'" data-workspace-pane="storyboard" class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-4">
            <slot name="storyboard" />
          </div>
          <div v-show="workspaceView === 'library'" data-workspace-pane="library" class="h-full min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4">
            <slot name="library" />
          </div>
          <div
            v-if="prepareMounted"
            v-show="preparing"
            data-workspace-pane="prepare"
            class="h-full min-h-0 min-w-0 overflow-y-auto"
          >
            <slot name="prepare" />
          </div>
          <div v-if="workspaceView === 'history'" data-workspace-pane="history" class="mx-auto h-full min-h-0 w-full min-w-0 max-w-5xl space-y-4 overflow-y-auto p-3 sm:p-5">
            <div class="min-w-0">
              <h3 class="break-words text-xl font-semibold text-highlighted">
                Project history
              </h3><p class="mt-1 break-words text-sm text-muted">
                Saved outputs and their current status. Viewing history never starts a new run.
              </p>
            </div>
            <slot name="history">
              <p class="text-sm text-muted">
                Open Review in the controls to inspect saved render jobs.
              </p>
            </slot>
          </div>
          <div v-if="workspaceView === 'guide'" class="mx-auto h-full min-h-0 min-w-0 max-w-4xl space-y-6 overflow-y-auto p-4 sm:p-5">
            <div>
              <h3 class="text-2xl font-semibold tracking-tight text-highlighted">
                From an idea to a finished edit
              </h3><p class="mt-2 text-sm leading-6 text-muted">
                Start with your own footage or an approved script. Keep every creative decision connected to the project.
              </p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UCard>
                <h4 class="font-semibold text-highlighted">
                  Plan the story
                </h4><p class="mt-2 text-sm leading-6 text-muted">
                  Open the Storyboard workspace. Set the brief and format, review the copy and references, and inspect the proposed shots before applying them.
                </p>
              </UCard>
              <UCard>
                <h4 class="font-semibold text-highlighted">
                  Choose your assets
                </h4><p class="mt-2 text-sm leading-6 text-muted">
                  Use Project assets for real footage, stills, voice and overlays. Selecting a model prepares a request; it does not start generation.
                </p>
              </UCard>
              <UCard>
                <h4 class="font-semibold text-highlighted">
                  Review before spending
                </h4><p class="mt-2 text-sm leading-6 text-muted">
                  Generation depends on the project's model access, approved sources and budget. Review the estimate and confirm the request separately.
                </p>
              </UCard>
              <UCard>
                <h4 class="font-semibold text-highlighted">
                  Keep control of the result
                </h4><p class="mt-2 text-sm leading-6 text-muted">
                  Edit the timeline, check format and copy findings, then render explicitly. History shows actual outputs; saving or publishing them is a separate action.
                </p>
              </UCard>
            </div>
            <UAlert
              color="neutral"
              variant="subtle"
              title="Availability follows your project"
              :description="generationStatusDetail"
            />
          </div>
        </div>
      </main>
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
