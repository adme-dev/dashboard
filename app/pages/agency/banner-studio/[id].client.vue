<script setup lang="ts">
import { FORMAT_SAFE_ZONE_MAP } from '~/utils/banner-safe-zones'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const toast = useToast()
const projectId = computed(() => route.params.id as string)

const {
  state,
  activeLayers,
  activeFormat,
  selectedLayer,
  allFormats,
  canUndo,
  canRedo,
  selectLayer,
  addLayer,
  removeLayer,
  duplicateLayer,
  updateLayer,
  setActiveArtboard,
  loadProject,
  saveProject,
  initDefault,
  undo,
  redo,
  syncAllFromActive,
  loadBannerSet,
  loadTemplate,
  copyLayer,
  cutLayer,
  pasteLayer,
  bringToFront,
  sendToBack,
} = useBannerStudio()

// Timeline integration
const { togglePlay, restartTimeline, buildTimeline } = useBannerTimeline()
const canvasRef = ref<any>(null)

// Realtime collaboration
const { connect: connectRealtime, disconnect: disconnectRealtime, remoteUsers } = useBannerRealtime()

// Timeline resize
const timelineHeight = ref(200)
const tlCollapsed = ref(false)
let tlHeightBeforeCollapse = 200
const MIN_TL_HEIGHT = 100
const MAX_TL_HEIGHT = 600
const tlResizing = ref(false)
let tlResizeStartY = 0
let tlResizeStartH = 0

function onTlResizeStart(e: MouseEvent) {
  e.preventDefault()
  tlResizing.value = true
  tlResizeStartY = e.clientY
  tlResizeStartH = timelineHeight.value
  window.addEventListener('mousemove', onTlResizeMove)
  window.addEventListener('mouseup', onTlResizeEnd)
}
function onTlResizeMove(e: MouseEvent) {
  const dy = tlResizeStartY - e.clientY // dragging up = bigger
  timelineHeight.value = Math.min(MAX_TL_HEIGHT, Math.max(MIN_TL_HEIGHT, tlResizeStartH + dy))
  if (tlCollapsed.value) tlCollapsed.value = false
}
function onTlResizeEnd() {
  tlResizing.value = false
  window.removeEventListener('mousemove', onTlResizeMove)
  window.removeEventListener('mouseup', onTlResizeEnd)
}
function onTlResizeDblClick() {
  if (tlCollapsed.value) {
    tlCollapsed.value = false
    timelineHeight.value = tlHeightBeforeCollapse
  } else {
    tlHeightBeforeCollapse = timelineHeight.value
    tlCollapsed.value = true
  }
}
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onTlResizeMove)
  window.removeEventListener('mouseup', onTlResizeEnd)
})

let rebuildTimer: ReturnType<typeof setTimeout> | null = null
function rebuildTimeline() {
  if (state.isPlaying) return
  // Debounce rebuilds — layers fire many reactive changes during init
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    nextTick(() => {
      const el = canvasRef.value?.getActiveArtboardEl?.()
      if (el) {
        buildTimeline(el, activeLayers.value)
      }
    })
  }, 50)
}

// Rebuild timeline when active artboard or layers change (shallow watch + length trigger)
watch(() => state.activeKey, rebuildTimeline)
watch(() => [activeLayers.value, activeLayers.value.length], rebuildTimeline)
watch(() => state.soloMotionPath, rebuildTimeline)
onMounted(() => nextTick(rebuildTimeline))

// Feed preview state
const { feedsState } = useBannerFeeds()

// Load fonts used in the project (including custom uploads)
const { loadUsedFonts, fetchCustomFonts } = useBannerFonts()
fetchCustomFonts()
watch(() => activeLayers.value, (layers) => {
  if (layers.length) loadUsedFonts(layers)
}, { immediate: true })

// Left panel tab state
const leftTab = ref<'sets' | 'templates' | 'elements' | 'assets' | 'feeds' | 'brand' | 'history'>('sets')
const leftTabItems = [
  { id: 'sets' as const, label: 'Sets', icon: 'i-lucide-layers' },
  { id: 'templates' as const, label: 'Templates', icon: 'i-lucide-layout-template' },
  { id: 'elements' as const, label: 'Elements', icon: 'i-lucide-shapes' },
  { id: 'assets' as const, label: 'Assets', icon: 'i-lucide-image' },
  { id: 'feeds' as const, label: 'Feeds', icon: 'i-lucide-database' },
  { id: 'brand' as const, label: 'Brand', icon: 'i-lucide-palette' },
  { id: 'history' as const, label: 'History', icon: 'i-lucide-history' },
]

// Modals
const showSizePicker = ref(false)
const showExportModal = ref(false)
const showPlayAll = ref(false)
const showGenerateUrl = ref(false)
const showDissector = ref(false)
const showPublishModal = ref(false)
const showSaveTemplate = ref(false)
const showDCOModal = ref(false)
const showAnalytics = ref(false)
const showABTests = ref(false)
const showAdPublish = ref(false)
const showPreview = ref(false)
const showSaveVersion = ref(false)
const versionLabel = ref('')
const isSavingVersion = ref(false)
const commentMode = computed({
  get: () => state.activeTool === 'comment',
  set: (v: boolean) => { state.activeTool = v ? 'comment' : 'select' },
})

// Provide comment mode for Canvas → CommentOverlay
provide('commentMode', commentMode)

// Show DCO button only when project has feeds with bindings
const hasFeedBindings = computed(() => {
  for (const key of state.setKeys) {
    const layers = state.sets[key]?.layers || []
    for (const l of layers) {
      if (l.feedBindings?.length) return true
    }
  }
  return false
})

// Safe zone zones for the current active format
const safeZoneKeys = computed(() => FORMAT_SAFE_ZONE_MAP[state.activeKey] || [])

function toggleSafeZone() {
  const keys = safeZoneKeys.value
  if (keys.length === 0) return
  // Single zone — toggle directly
  if (state.showSafeZones && state.activeSafeZone === keys[0]) {
    state.showSafeZones = false
    state.activeSafeZone = null
  } else {
    state.activeSafeZone = keys[0]
    state.showSafeZones = true
  }
}

// Provide showSizePicker for BannerSetsPanel
provide('showSizePicker', showSizePicker)

// Keyboard shortcuts
useBannerKeyboard({ showExportModal })

// Load project from API (or init default for "new")
const { data: projectData } = await useFetch(`/api/agency/banner-studio/projects/${projectId.value}`, {
  immediate: projectId.value !== 'new',
})

onMounted(() => {
  if (projectId.value === 'new' || !projectData.value) {
    initDefault()
  } else {
    loadProject(projectData.value as any)
  }

  // Connect realtime collaboration for existing projects
  if (projectId.value !== 'new') {
    connectRealtime(projectId.value)
  }
})

onBeforeUnmount(() => {
  disconnectRealtime()
})

// Auto-save indicator
const saveStatus = computed(() => {
  if (state.isSaving) return 'Saving...'
  if (state.isDirty) return 'Unsaved changes'
  return 'Saved'
})

// Review status
const { data: reviewData, refresh: refreshReview } = useFetch<any>(
  () => projectId.value !== 'new' ? `/api/agency/banner-studio/reviews/${projectId.value}` : null,
  { default: () => null },
)

const reviewStatus = computed(() => reviewData.value?.reviewStatus || 'draft')
const REVIEW_STATUS_COLORS: Record<string, string> = {
  draft: 'neutral',
  in_review: 'warning',
  changes_requested: 'error',
  approved: 'success',
  published: 'primary',
}
const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  published: 'Published',
}

async function handleSave() {
  try {
    // Auto-create project on first save when route is "new"
    if (!state.project?.id) {
      const created = await $fetch('/api/agency/banner-studio/projects', {
        method: 'POST',
        body: {
          name: state.project?.name || 'Untitled Banner',
          canvasData: state.sets,
        },
      })
      state.project = created as any
      state.isDirty = false
      toast.add({ title: 'Created', description: 'Project created successfully', color: 'success' })
      // Redirect from /new to the real project ID
      await navigateTo(`/agency/banner-studio/${(created as any).id}`, { replace: true })
      return
    }
    await saveProject()
    toast.add({ title: 'Saved', description: 'Project saved successfully', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to save project', color: 'error' })
  }
}

// Save version
async function handleSaveVersion() {
  if (!state.project?.id) return
  isSavingVersion.value = true
  try {
    const result = await $fetch('/api/agency/banner-studio/versions', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        label: versionLabel.value || undefined,
        canvasData: state.sets,
      },
    }) as any
    toast.add({ title: 'Version Saved', description: `Version ${result.versionNumber}: ${result.label}`, color: 'success' })
    showSaveVersion.value = false
    versionLabel.value = ''
  } catch {
    toast.add({ title: 'Error', description: 'Failed to save version', color: 'error' })
  } finally {
    isSavingVersion.value = false
  }
}

// Zoom controls
function zoomIn() {
  state.wsScale = Math.min(2, state.wsScale * 1.2)
}
function zoomOut() {
  state.wsScale = Math.max(0.05, state.wsScale / 1.2)
}
function zoomFit() {
  const fmt = activeFormat.value
  if (!fmt) { state.wsScale = 0.22; return }
  const availW = Math.max(400, window.innerWidth - 64 - 256 - 40 - 288)
  const availH = Math.max(300, window.innerHeight - 64 - 40 - 200)
  const scale = Math.min(availW / fmt.w, availH / fmt.h) * 0.85
  state.wsScale = Math.max(0.1, Math.min(2.0, scale))
}

const zoomPercent = computed(() => Math.round(state.wsScale * 100))

// File size estimation
const { activeSize } = useBannerFileSize()
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-[#1a1a1e]">
    <!-- Top Toolbar -->
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-[#3a3a3f] bg-[#2d2d32] shrink-0">
      <!-- Project name -->
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-palette" class="text-(--ui-text-muted) shrink-0" />
        <span class="text-sm font-semibold truncate">{{ state.project?.name || 'New Banner' }}</span>
        <UBadge :color="state.isDirty ? 'warning' : 'success'" variant="subtle" size="xs">
          {{ saveStatus }}
        </UBadge>
        <!-- Collaboration presence -->
        <BannerCollaborationPresence />

        <UBadge
          v-if="reviewStatus !== 'draft'"
          :color="REVIEW_STATUS_COLORS[reviewStatus] || 'neutral'"
          variant="subtle"
          size="xs"
        >
          {{ REVIEW_STATUS_LABELS[reviewStatus] || reviewStatus }}
        </UBadge>
      </div>

      <div class="h-4 w-px bg-[#3a3a3f]" />

      <!-- Undo / Redo -->
      <div class="flex gap-0.5">
        <UButton icon="i-lucide-undo-2" variant="ghost" size="xs" :disabled="!canUndo" @click="undo" />
        <UButton icon="i-lucide-redo-2" variant="ghost" size="xs" :disabled="!canRedo" @click="redo" />
      </div>

      <div class="h-4 w-px bg-[#3a3a3f]" />

      <!-- Generate from URL -->
      <UButton
        icon="i-lucide-globe"
        label="From URL"
        variant="ghost"
        size="xs"
        @click="showGenerateUrl = true"
      />
      <!-- Dissect banner -->
      <UButton
        icon="i-lucide-scan-line"
        label="Dissect"
        variant="ghost"
        size="xs"
        @click="showDissector = true"
      />

      <div class="flex-1" />

      <!-- Active format chip -->
      <UButton
        v-if="activeFormat"
        variant="soft"
        size="xs"
        class="ring-1 ring-(--ui-primary)"
        @click="showSizePicker = true"
      >
        <span class="font-mono text-xs">{{ activeFormat.w }}×{{ activeFormat.h }}</span>
        <span class="text-xs text-(--ui-text-muted)">{{ activeFormat.name }}</span>
        <UIcon name="i-lucide-chevron-down" class="w-3 h-3" />
      </UButton>

      <!-- File size indicator -->
      <BannerFileSizeMeter :total="activeSize.total" class="w-24" />

      <div class="h-4 w-px bg-[#3a3a3f]" />

      <!-- Grid / Snap -->
      <div class="flex items-center gap-0.5">
        <UButton
          icon="i-lucide-grid-3x3"
          variant="ghost"
          size="xs"
          :class="state.showGrid ? 'text-(--ui-primary)' : ''"
          title="Toggle grid"
          @click="state.showGrid = !state.showGrid"
        />
        <UButton
          icon="i-lucide-magnet"
          variant="ghost"
          size="xs"
          :class="state.snapToGrid ? 'text-(--ui-primary)' : ''"
          title="Snap to grid"
          @click="state.snapToGrid = !state.snapToGrid"
        />
        <UPopover v-if="safeZoneKeys.length > 1">
          <UButton
            icon="i-lucide-shield"
            variant="ghost"
            size="xs"
            :class="state.showSafeZones && safeZoneKeys.includes(state.activeSafeZone) ? 'text-(--ui-primary)' : ''"
            title="Safe zones"
          />
          <template #content>
            <BannerSafeZoneSelector :zone-keys="safeZoneKeys" />
          </template>
        </UPopover>
        <UButton
          v-else
          icon="i-lucide-shield"
          variant="ghost"
          size="xs"
          :class="state.showSafeZones && safeZoneKeys.includes(state.activeSafeZone) ? 'text-(--ui-primary)' : ''"
          :disabled="safeZoneKeys.length === 0"
          :title="safeZoneKeys.length === 0 ? 'No safe zones for this format' : 'Toggle safe zone'"
          @click="toggleSafeZone"
        />
      </div>

      <!-- Zoom -->
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-zoom-out" variant="ghost" size="xs" @click="zoomOut" />
        <span class="text-[11px] font-mono tabular-nums text-[#888] w-12 text-center">{{ zoomPercent }}%</span>
        <UButton icon="i-lucide-zoom-in" variant="ghost" size="xs" @click="zoomIn" />
        <UButton icon="i-lucide-scan" variant="ghost" size="xs" @click="zoomFit" />
      </div>

      <div class="h-4 w-px bg-[#3a3a3f]" />

      <!-- Timeline controls -->
      <div class="flex gap-0.5">
        <UButton
          :icon="state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          :variant="state.isPlaying ? 'solid' : 'ghost'"
          size="xs"
          @click="togglePlay"
        />
        <UButton icon="i-lucide-rotate-ccw" variant="ghost" size="xs" @click="restartTimeline" />
        <UButton
          icon="i-lucide-layout-grid"
          variant="ghost"
          size="xs"
          @click="showPlayAll = true"
        />
      </div>

      <div class="h-4 w-px bg-[#3a3a3f]" />

      <!-- Actions -->
      <UButton icon="i-lucide-save" variant="ghost" size="xs" @click="handleSave" />
      <UButton icon="i-lucide-bookmark-plus" variant="ghost" size="xs" title="Save Version" @click="showSaveVersion = true" />
      <UButton icon="i-lucide-bookmark" variant="ghost" size="xs" title="Save as Template" @click="showSaveTemplate = true" />
      <UButton icon="i-lucide-bar-chart-3" variant="ghost" size="xs" title="Analytics" @click="showAnalytics = true" />
      <UButton icon="i-lucide-split" variant="ghost" size="xs" title="A/B Tests" @click="showABTests = true" />
      <UButton icon="i-lucide-eye" variant="ghost" size="xs" title="Ad Preview" @click="showPreview = true" />
      <UButton icon="i-lucide-megaphone" variant="ghost" size="xs" title="Publish to Ad Platforms" @click="showAdPublish = true" />
      <UButton label="Publish" icon="i-lucide-globe" variant="soft" size="xs" @click="showPublishModal = true" />
      <UButton v-if="hasFeedBindings" label="DCO" icon="i-lucide-layers" variant="soft" color="warning" size="xs" @click="showDCOModal = true" />
      <UButton label="Export" icon="i-lucide-download" size="xs" @click="showExportModal = true" />
    </div>

    <!-- Main Content -->
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Left Sidebar -->
      <div class="w-64 shrink-0 border-r border-[#3a3a3f] flex flex-col bg-[#252528]">
        <!-- Left tabs (icon-only with tooltips) -->
        <div class="flex items-center border-b border-[#3a3a3f] bg-[#2a2a2e]">
          <UTooltip v-for="tab in leftTabItems" :key="tab.id" :text="tab.label" :delay-duration="300">
            <button
              class="flex-1 flex items-center justify-center py-2.5 transition-colors"
              :class="leftTab === tab.id
                ? 'text-[#4a8fe8] border-b-2 border-[#4a8fe8] bg-[#4a8fe8]/5'
                : 'text-[#666] hover:text-[#999]'"
              @click="leftTab = tab.id"
            >
              <UIcon :name="tab.icon" class="w-4 h-4" />
            </button>
          </UTooltip>
        </div>

        <!-- Left panel content -->
        <div class="flex-1 overflow-y-auto">
          <BannerSetsPanel v-if="leftTab === 'sets'" />
          <BannerTemplatesPanel v-else-if="leftTab === 'templates'" />
          <BannerElementsPanel v-else-if="leftTab === 'elements'" />
          <BannerAssetsPanel v-else-if="leftTab === 'assets'" />
          <BannerFeedsPanel v-else-if="leftTab === 'feeds'" />
          <BannerBrandPanel v-else-if="leftTab === 'brand'" />
          <BannerVersionHistoryPanel v-else-if="leftTab === 'history'" :project-id="projectId" />
        </div>
      </div>

      <!-- Vertical Toolbar -->
      <BannerToolbar @switch-tab="(tab: string) => leftTab = tab as any" />

      <!-- Center: Canvas + Timeline -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Feed Preview Bar -->
        <BannerFeedPreviewBar v-if="feedsState.isPreviewMode" />

        <!-- Canvas workspace -->
        <div class="flex-1 overflow-auto relative bg-[#1a1a1e]">
          <BannerCanvas ref="canvasRef" :project-id="projectId" />
        </div>

        <!-- Timeline resize handle -->
        <div
          class="h-1.5 shrink-0 cursor-row-resize group relative border-t border-[#3a3a3f] hover:bg-[#4af0a2]/20 transition-colors"
          :class="tlResizing ? 'bg-[#4af0a2]/30' : ''"
          @mousedown="onTlResizeStart"
          @dblclick="onTlResizeDblClick"
        >
          <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 mx-auto w-8 rounded transition-colors" :class="tlCollapsed ? 'bg-[#4af0a2]' : 'bg-[#555] group-hover:bg-[#4af0a2]'" />
        </div>

        <!-- Timeline -->
        <div v-show="!tlCollapsed" class="shrink-0" :style="{ height: timelineHeight + 'px' }">
          <BannerTimeline />
        </div>
      </div>

      <!-- Right Inspector -->
      <div class="w-72 shrink-0 border-l border-[#3a3a3f] overflow-y-auto bg-[#252528]">
        <BannerInspector />
      </div>
    </div>

    <!-- Modals -->
    <BannerSizePicker v-model:open="showSizePicker" />
    <BannerExportModal v-if="showExportModal" v-model:open="showExportModal" />
    <BannerPlayAll v-if="showPlayAll" v-model:open="showPlayAll" />
    <BannerGenerateFromUrl v-if="showGenerateUrl" v-model:open="showGenerateUrl" />
    <BannerDissectorModal v-if="showDissector" v-model:open="showDissector" />
    <BannerPublishModal v-if="showPublishModal" v-model:open="showPublishModal" @open-dco="showDCOModal = true" />
    <BannerDCOGenerateModal v-if="showDCOModal" v-model:open="showDCOModal" />
    <BannerSaveAsTemplate v-if="showSaveTemplate" v-model:open="showSaveTemplate" />

    <!-- A/B Tests Modal -->
    <BannerABTestModal v-if="showABTests" v-model:open="showABTests" :project-id="projectId" />

    <!-- Ad Platform Publish Modal -->
    <BannerAdPublishModal v-if="showAdPublish" v-model:open="showAdPublish" :project-id="projectId" />

    <!-- Ad Preview Slideover -->
    <USlideover v-model:open="showPreview" side="right" :ui="{ width: 'max-w-5xl' }">
      <template #content>
        <div class="p-5 h-full overflow-y-auto bg-[#111114]">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold">Ad Preview</h2>
            <div class="flex items-center gap-2">
              <NuxtLink to="/agency/ad-preview" target="_blank">
                <UButton label="Open Full Page" icon="i-lucide-external-link" variant="ghost" size="xs" />
              </NuxtLink>
              <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="showPreview = false" />
            </div>
          </div>
          <div class="flex flex-wrap gap-6 items-start justify-center">
            <div class="flex flex-col items-center">
              <div class="text-xs text-[#888] mb-2 font-medium">Meta Feed</div>
              <AdPreviewMetaFeedPreview
                :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
                :page-name="state.project?.name"
              />
            </div>
            <AdPreviewMetaStoryPreview
              :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
              :page-name="state.project?.name"
            />
            <AdPreviewTikTokPreview
              :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
              :page-name="state.project?.name"
            />
            <AdPreviewYouTubePreview
              :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
              :page-name="state.project?.name"
            />
            <div class="flex flex-col items-center">
              <div class="text-xs text-[#888] mb-2 font-medium">LinkedIn</div>
              <AdPreviewLinkedInPreview
                :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
                :page-name="state.project?.name"
              />
            </div>
            <AdPreviewSnapchatPreview
              :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
              :page-name="state.project?.name"
            />
            <div class="flex flex-col items-center">
              <div class="text-xs text-[#888] mb-2 font-medium">Pinterest</div>
              <AdPreviewPinterestPreview
                :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
                :page-name="state.project?.name"
              />
            </div>
            <div class="flex flex-col items-center">
              <div class="text-xs text-[#888] mb-2 font-medium">X (Twitter)</div>
              <AdPreviewXPreview
                :image="state.sets[state.activeKey]?.layers?.find(l => l.type === 'bg')?.src"
                :page-name="state.project?.name"
              />
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <!-- AI Edit Layer Slideover -->
    <BannerAiEditSlideover />

    <!-- AI Generate Image Slideover -->
    <BannerAiGenerateSlideover />

    <!-- Save Version Modal -->
    <UModal v-model:open="showSaveVersion">
      <template #content>
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold">Save Version</h2>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="showSaveVersion = false" />
          </div>
          <p class="text-sm text-(--ui-text-muted) mb-4">
            Create a named snapshot of the current canvas state. You can restore it later from the History panel.
          </p>
          <UInput
            v-model="versionLabel"
            placeholder="Version label (optional)"
            class="mb-4"
            @keydown.enter="handleSaveVersion"
          />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" size="sm" @click="showSaveVersion = false" />
            <UButton
              label="Save Version"
              icon="i-lucide-bookmark-plus"
              size="sm"
              :loading="isSavingVersion"
              @click="handleSaveVersion"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Analytics Modal -->
    <UModal v-model:open="showAnalytics" :ui="{ width: 'max-w-3xl' }">
      <template #content>
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold">Analytics</h2>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="showAnalytics = false" />
          </div>
          <BannerAnalyticsDashboard :project-id="projectId" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
/* Thin scrollbars matching Apple dark UI */
:deep(.overflow-y-auto),
:deep(.overflow-auto) {
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
}
:deep(::-webkit-scrollbar) { width: 5px; height: 5px; }
:deep(::-webkit-scrollbar-thumb) { background: #444; border-radius: 3px; }
:deep(::-webkit-scrollbar-track) { background: transparent; }

/* Range input styling */
:deep(input[type="range"]) { accent-color: #4a8fe8; }
</style>
