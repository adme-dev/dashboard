<script setup lang="ts">
// SP2c full multitrack editor. Extends the SP2b read-only preview by wiring every
// MediaTimeline emit to the composable actions, adding an edit toolbar (undo/redo,
// split, add-clip, save-version), and passing the reactive sources map for waveforms.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaProjectEditor } from '~~/app/composables/useMediaProjectEditor'
import type { PickedAsset } from '~~/app/components/media/MediaAssetPicker.vue'
import { resolveGeneratedClipInspector } from '~~/app/utils/video/generatedClipInspector'
import type { AiAssemblyTimelinePayload } from '~~/app/utils/video/aiAssemblyTimeline'
import type { AssetDerivativeTimelinePayload } from '~~/app/utils/video/assetDerivativeTimeline'
import type { VideoAsset } from '~~/server/utils/video/assets'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const projectId = computed(() => String(route.params.id))
const editor = useMediaProjectEditor(projectId.value)

// ─── Time format helper ───────────────────────────────────────────────────────

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ─── Asset picker ─────────────────────────────────────────────────────────────

const pickerOpen = ref(false)

function onPickerPick(asset: PickedAsset) {
  if (!editor.timeline.value) return
  // Defensive add: if the project has no track of the asset's kind (e.g. an empty
  // timeline), addClipToKindTrackAction appends one before adding — the add never
  // silently no-ops. Track-create + clip-insert collapse into one undo step.
  editor.addClipToKindTrackAction(
    { id: asset.id, r2_key_master: asset.r2_key_master, kind: asset.kind },
    editor.currentTime.value,
    asset.streamUrl
  )
}

// ─── Save version modal ──────────────────────────────────────────────────────

const saveVersionOpen = ref(false)
const versionLabel = ref('')
const savingVersion = ref(false)
const toast = useToast()

// ─── AV (video studio) wiring ──────────────────────────────────────────────────
// Everything below is AV-only; audio projects (`!isAv`) keep the original behavior.

const config = useRuntimeConfig()
const videoStudioEnabled = computed(() => Boolean((config.public as any).videoStudioEnabled))
const videoAssetHarnessEnabled = computed(() => Boolean((config.public as any).videoAssetHarnessEnabled))
const isAv = computed(() => editor.mediaType.value === 'av')

// AV pickers
const overlayPickerOpen = ref(false)
const mediaPickerOpen = ref(false)

function onOverlayPick(p: { gsapProjectId: string; gsapFormatKey: string }) {
  editor.addOverlayClipAction(p.gsapProjectId, p.gsapFormatKey, 5, editor.currentTime.value)
}
function onMediaUploaded(p: { r2Key: string; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }) {
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value)
}

// ─── Video generation wiring ──────────────────────────────────────────────────

const videoGenerationEnabled = computed(() => Boolean((config.public as any).videoGenerationEnabled))
const videoGenerationModelsAvailable = computed(() => videoGenerationEnabled.value)
const generatePickerOpen = ref(false)
const generationDraftPrompt = ref<string | null>(null)
const genJobs = useVideoGenerationJobs(projectId.value)
const videoAssets = ref<VideoAsset[]>([])
const selectedClipId = ref<string | null>(null)

// Stills already on the timeline that have a backing video_assets id (i2v source).
// NOTE: clips added via addVideoClip have asset_id=null, so this is usually empty in
// slice 1 — i2v source-still selection is a documented follow-up. Kept so the prop is wired.
const timelineStills = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return [] as { assetId: string; label: string }[]
  const out: { assetId: string; label: string }[] = []
  for (const t of tl.tracks) if (t.kind === 'video') for (const c of (t.clips as any[])) {
    if (c.base_source === 'still_kenburns' && c.asset_id) out.push({ assetId: c.asset_id, label: `Still @ ${Math.round(c.timeline_start_sec)}s` })
  }
  return out
})
const projectAspect = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return '9:16'
  return tl.width >= tl.height ? '16:9' : '9:16'
})

function onGenerationSubmitted(_jobId: string) { void genJobs.start() }
function onLibraryAddToTimeline(p: { assetId: string; r2Key: string; durationSec: number; streamUrl: string; title: string | null; format: string | null }) {
  editor.mergeSource(p.r2Key, p.streamUrl, { durationSec: p.durationSec, assetId: p.assetId, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, 'uploaded_footage', editor.currentTime.value, p.assetId)
  toast.add({ title: 'Added to timeline', color: 'success' })
}

function onHarnessAddToTimeline(p: AiAssemblyTimelinePayload) {
  const streamUrl = p.assetId ? `/api/agency/video/assets/${encodeURIComponent(p.assetId)}/stream` : p.r2Key
  editor.mergeSource(p.r2Key, streamUrl, { durationSec: p.durationSec, assetId: p.assetId, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, 'uploaded_footage', p.startSec, p.assetId)
}

function onHarnessAddDerivativeToTimeline(p: AssetDerivativeTimelinePayload) {
  editor.mergeSource(p.r2Key, p.streamUrl, { durationSec: p.durationSec, assetId: null, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value, null)
  toast.add({ title: 'Derivative added to timeline', color: 'success' })
}

async function refreshVideoAssets() {
  try {
    const res = await editor.listVideoAssets()
    videoAssets.value = res.assets ?? []
  } catch {
    videoAssets.value = []
  }
}

function onReusePrompt(p: { prompt: string; modelId: string | null }) {
  generationDraftPrompt.value = p.prompt
  libraryOpen.value = false
  generatePickerOpen.value = true
}

const selectedGeneratedClip = computed(() => resolveGeneratedClipInspector({
  selectedClipId: selectedClipId.value,
  timeline: editor.timeline.value,
  assets: videoAssets.value,
}))

async function copySelectedPrompt() {
  if (selectedGeneratedClip.value.kind !== 'generated-video' || !selectedGeneratedClip.value.prompt) return
  await navigator.clipboard?.writeText(selectedGeneratedClip.value.prompt)
}

function duplicateSelectedGeneratedClip() {
  if (selectedGeneratedClip.value.kind !== 'generated-video') return
  editor.mergeSource(selectedGeneratedClip.value.r2Key, `/api/agency/video/assets/${selectedGeneratedClip.value.assetId}/stream`, {
    durationSec: selectedGeneratedClip.value.durationSec ?? 5,
    assetId: selectedGeneratedClip.value.assetId,
    title: selectedGeneratedClip.value.title,
    format: selectedGeneratedClip.value.format,
  })
  editor.addVideoClipAction(selectedGeneratedClip.value.r2Key, selectedGeneratedClip.value.durationSec ?? 5, 'uploaded_footage', editor.currentTime.value, selectedGeneratedClip.value.assetId)
}

async function publishSelectedGeneratedClip() {
  if (selectedGeneratedClip.value.kind !== 'generated-video') return
  try {
    const res = await editor.publishVideoAssetToSocial(selectedGeneratedClip.value.assetId)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: any) {
    toast.add({ title: 'Could not publish selected clip', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

// Render
async function onRenderVideo() {
  const res = await editor.renderVideoAction()
  if (res.ok) toast.add({ title: 'Render queued', description: 'Your video is rendering.', color: 'success' })
  else if (res.flagOff) toast.add({ title: 'Video rendering is disabled', description: 'Ask an admin to enable VIDEO_STUDIO_ENABLED.', color: 'warning' })
  else toast.add({ title: 'Failed to queue render', color: 'error' })
}

async function onPublishToSocial(job: any, format: string) {
  try {
    const res = await editor.publishToSocial(job.id, format)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: any) {
    toast.add({ title: 'Could not publish to social', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

async function onSendToPortal(job: any, format: string) {
  try {
    await editor.sendToPortal(job.id, String(format))
    toast.add({ title: 'Sent to client portal', description: 'The client can review it in their portal.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not send to portal', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

async function onSaveAsset(job: any, format: string) {
  try {
    await editor.saveAsset(job.id, String(format))
    await refreshVideoAssets()
    toast.add({ title: 'Saved to library', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save to library', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

// Video library (AV reuse)
const libraryOpen = ref(false)
async function onLibraryPublish(p: { assetId: string; sourceJobId: string | null; format: string }) {
  try {
    const res = await editor.publishVideoAssetToSocial(p.assetId)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: any) {
    toast.add({ title: 'Could not publish from library', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

function jobStatusColor(s: string) { return s === 'done' ? 'success' : s === 'failed' ? 'error' : 'info' }

// Refresh render jobs once an AV project finishes loading (isAv depends on the
// async-loaded timeline, so watch it rather than onMounted).
watch(isAv, (av) => {
  if (!av) return
  void editor.refreshRenderJobs()
  void refreshVideoAssets()
}, { immediate: true })

watch(() => genJobs.jobs.value.map((job) => `${job.id}:${job.status}:${job.outputAssetId ?? ''}`).join('|'), () => {
  if (genJobs.jobs.value.some((job) => job.status === 'succeeded' && job.outputAssetId)) void refreshVideoAssets()
})

async function doSaveVersion() {
  if (savingVersion.value) return
  savingVersion.value = true
  try {
    await editor.saveVersion(versionLabel.value.trim() || 'Snapshot')
    toast.add({ title: 'Version saved', color: 'success' })
    saveVersionOpen.value = false
    versionLabel.value = ''
  } catch {
    toast.add({ title: 'Failed to save version', color: 'error' })
  } finally {
    savingVersion.value = false
  }
}

// ─── Versions slideover ───────────────────────────────────────────────────────

interface VersionRow {
  id: string
  version: number
  label: string | null
  createdAt: string
  state: import('~~/server/utils/audio/timelineSchema').TimelineState
}

const versionsOpen = ref(false)
const versions = ref<VersionRow[]>([])
const versionsLoading = ref(false)
const restoringId = ref<string | null>(null)

async function loadVersions() {
  versionsLoading.value = true
  try {
    const res = await editor.listVersions()
    versions.value = res.versions
  } catch {
    toast.add({ title: 'Failed to load versions', color: 'error' })
  } finally {
    versionsLoading.value = false
  }
}

function openVersions() {
  versionsOpen.value = true
  void loadVersions()
}

function restore(version: VersionRow) {
  restoringId.value = version.id
  try {
    editor.restoreVersion(version.state)
    toast.add({ title: `Restored ${version.label ?? `v${version.version}`}`, color: 'success' })
    versionsOpen.value = false
  } finally {
    restoringId.value = null
  }
}

function fmtVersionDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
// S and Delete are handled inside MediaTimeline (window listener).
// Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z → redo.

function onKeyDown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
  const isMeta = event.metaKey || event.ctrlKey
  if (isMeta && event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.redoAction()
  } else if (isMeta && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.undoAction()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  if (videoGenerationEnabled.value) void genJobs.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  genJobs.stop()
})

// ─── Save status label ────────────────────────────────────────────────────────

const saveStatusLabel = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Save failed'
    default: return null
  }
})

const saveStatusColor = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'text-muted'
    case 'saved': return 'text-success'
    case 'error': return 'text-error'
    default: return 'text-muted'
  }
})
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-5xl mx-auto p-6 space-y-4">

      <!-- Header -->
      <header class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          to="/agency/audio/projects"
          aria-label="Back to projects"
        />
        <div class="space-y-0.5 flex-1">
          <h1 class="text-2xl font-semibold tracking-tight">Timeline editor</h1>
          <p class="text-sm text-muted">{{ isAv ? 'Video editor — assemble footage, stills, overlays and audio, then render.' : 'Multitrack editor — drag, trim, slice, and layer your clips.' }}</p>
        </div>
        <!-- Save status pill -->
        <span
          v-if="saveStatusLabel"
          class="text-xs font-medium tabular-nums"
          :class="saveStatusColor"
        >{{ saveStatusLabel }}</span>
      </header>

      <!-- Edit toolbar -->
      <div
        v-if="editor.status.value === 'ready'"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2"
      >
        <!-- Undo / Redo -->
        <UButton
          icon="i-lucide-undo-2"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Undo"
          :disabled="!editor.canUndo.value"
          aria-label="Undo (⌘Z)"
          @click="editor.undoAction()"
        />
        <UButton
          icon="i-lucide-redo-2"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Redo"
          :disabled="!editor.canRedo.value"
          aria-label="Redo (⌘⇧Z)"
          @click="editor.redoAction()"
        />

        <div class="h-5 w-px bg-default mx-1" />

        <!-- Add (audio: single button; AV: menu) -->
        <UButton
          v-if="!isAv"
          icon="i-lucide-plus-circle" size="sm" variant="soft" color="primary" label="Add clip"
          @click="pickerOpen = true"
        />
        <UDropdownMenu
          v-else
          :items="[[
            { label: 'Audio clip', icon: 'i-lucide-music', onSelect: () => { pickerOpen = true } },
            { label: 'Footage / still', icon: 'i-lucide-film', onSelect: () => { mediaPickerOpen = true } },
            { label: 'Overlay', icon: 'i-lucide-shapes', onSelect: () => { overlayPickerOpen = true } },
            ...(videoGenerationEnabled && videoGenerationModelsAvailable ? [{ label: 'Generate (AI)', icon: 'i-lucide-sparkles', onSelect: () => { generatePickerOpen = true } }] : []),
            ...(videoGenerationEnabled && !videoGenerationModelsAvailable ? [{ label: 'Generate (AI unavailable)', icon: 'i-lucide-sparkles', disabled: true }] : []),
          ]]"
        >
          <UButton icon="i-lucide-plus-circle" size="sm" variant="soft" color="primary" label="Add" trailing-icon="i-lucide-chevron-down" />
        </UDropdownMenu>

        <!-- Render video (AV only; gated) -->
        <UButton
          v-if="isAv && videoStudioEnabled"
          icon="i-lucide-clapperboard" size="sm" variant="soft" color="primary" label="Render video"
          :loading="editor.rendering.value"
          @click="onRenderVideo"
        />
        <UTooltip v-else-if="isAv" text="Video rendering is disabled (VIDEO_STUDIO_ENABLED off)">
          <UButton icon="i-lucide-clapperboard" size="sm" variant="ghost" color="neutral" label="Render video" disabled />
        </UTooltip>

        <!-- Video library (AV only) -->
        <UButton v-if="isAv" icon="i-lucide-clapperboard" size="sm" variant="ghost" color="neutral" label="Library" @click="libraryOpen = true" />

        <!-- Save version -->
        <UButton
          icon="i-lucide-bookmark"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Save version"
          @click="saveVersionOpen = true"
        />

        <!-- Versions history -->
        <UButton
          icon="i-lucide-history"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Versions"
          @click="openVersions"
        />
      </div>

      <!-- Loading / error states -->
      <USkeleton v-if="editor.status.value === 'loading'" class="h-48 w-full" />

      <UAlert
        v-else-if="editor.status.value === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Couldn't load this project"
        :description="editor.error.value ?? 'Unknown error'"
      />

      <template v-else-if="editor.status.value === 'ready' && editor.timeline.value">
        <!-- Missing-source warning — non-fatal. The project still loads so the user
             can remove or replace clips whose audio files are gone (deleted/404). -->
        <UAlert
          v-if="editor.missingClipIds.value.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${editor.missingClipIds.value.length} ${editor.missingClipIds.value.length === 1 ? 'clip is' : 'clips are'} missing audio`"
          description="Their source files couldn't be loaded — they may have been deleted. These clips appear on the timeline but produce no sound. Remove or replace them, then save."
        />

        <MediaAssetHarness
          v-if="isAv && videoAssetHarnessEnabled"
          :project-id="projectId"
          @add-to-timeline="onHarnessAddToTimeline"
          @add-derivative-to-timeline="onHarnessAddDerivativeToTimeline"
        />

        <!-- AV preview (frame-accurate compositor) -->
        <MediaAvPreview
          v-if="isAv"
          :timeline="editor.timeline.value"
          :current-time="editor.currentTime.value"
          :is-playing="editor.isPlaying.value"
          :sources="editor.sources.value"
        />

        <!-- Timeline with full SP2c interaction layer -->
        <MediaTimeline
          :timeline="editor.timeline.value"
          :clips="editor.clips.value"
          :tracks="editor.tracks.value"
          :current-time="editor.currentTime.value"
          :duration="editor.duration.value"
          :sources="editor.sources.value"
          @select="(p) => { selectedClipId = p.clipId }"
          @seek="(sec) => editor.seek(sec)"
          @move-clip="(p) => editor.moveClipAction(p.clipId, p.toTrackId, p.newStartSec)"
          @trim-clip="(p) => editor.trimClipAction(p.clipId, p.edge, p.newTimeSec)"
          @slice="(p) => editor.sliceAction(p.clipId, p.timeSec)"
          @delete-clip="(p) => editor.deleteClipAction(p.clipId)"
        />

        <div v-if="isAv && selectedGeneratedClip.kind === 'generated-video'" class="rounded-lg border border-default bg-elevated p-3">
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-sm font-medium text-highlighted">{{ selectedGeneratedClip.title }}</p>
                <UBadge v-if="selectedGeneratedClip.format" :label="selectedGeneratedClip.format" size="xs" variant="subtle" color="neutral" />
                <UBadge v-if="selectedGeneratedClip.durationSec" :label="`${selectedGeneratedClip.durationSec}s`" size="xs" variant="subtle" color="neutral" />
              </div>
              <p class="mt-1 text-xs text-muted">Model: {{ selectedGeneratedClip.modelLabel }}</p>
              <p v-if="selectedGeneratedClip.prompt" class="mt-1 line-clamp-2 text-xs text-muted">{{ selectedGeneratedClip.prompt }}</p>
              <p v-if="selectedGeneratedClip.sourceJobId" class="mt-1 text-[11px] text-muted">Job {{ selectedGeneratedClip.sourceJobId }}</p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                v-if="selectedGeneratedClip.prompt"
                icon="i-lucide-copy"
                size="xs"
                variant="ghost"
                color="neutral"
                label="Copy prompt"
                @click="copySelectedPrompt"
              />
              <UButton
                icon="i-lucide-copy-plus"
                size="xs"
                variant="ghost"
                color="neutral"
                label="Duplicate"
                @click="duplicateSelectedGeneratedClip"
              />
              <UButton
                icon="i-lucide-share-2"
                size="xs"
                variant="soft"
                color="primary"
                label="Publish"
                @click="publishSelectedGeneratedClip"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                label="Remove"
                @click="editor.deleteClipAction(selectedGeneratedClip.clipId)"
              />
            </div>
          </div>
        </div>

        <!-- Transport bar -->
        <div class="flex items-center gap-4 rounded-lg border border-default bg-elevated p-3">
          <UButton
            :icon="editor.isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play'"
            color="primary"
            :aria-label="editor.isPlaying.value ? 'Pause' : 'Play'"
            @click="editor.isPlaying.value ? editor.pause() : editor.play()"
          />
          <span class="w-20 shrink-0 tabular-nums text-sm text-muted">
            {{ fmt(editor.currentTime.value) }} / {{ fmt(editor.duration.value) }}
          </span>
          <USlider
            class="flex-1"
            :min="0"
            :max="Math.max(editor.duration.value, 0.001)"
            :step="0.01"
            :model-value="editor.currentTime.value"
            @update:model-value="(v: number | number[]) => editor.seek(Array.isArray(v) ? v[0]! : v)"
          />
        </div>

        <!-- Render jobs (AV) -->
        <div v-if="isAv && editor.renderJobs.value.length" class="rounded-lg border border-default bg-elevated p-3 space-y-2">
          <p class="text-xs font-medium text-muted">Render jobs</p>
          <div v-for="job in editor.renderJobs.value" :key="job.id" class="flex items-center gap-3 text-sm">
            <UBadge :label="job.status" size="xs" variant="subtle" :color="jobStatusColor(job.status)" />
            <span class="text-muted tabular-nums">{{ new Date(job.createdAt).toLocaleString() }}</span>
            <span v-if="job.error" class="text-error truncate">{{ job.error }}</span>
            <div class="ml-auto flex gap-2">
              <UButton
                v-for="(key, fmt) in (job.variants || {})" :key="fmt"
                :label="String(fmt)" size="xs" variant="soft" color="neutral"
                :to="`/api/agency/audio/projects/${projectId}/renders/${job.id}/${fmt}`"
                target="_blank"
              />
              <UDropdownMenu
                v-if="job.status === 'done'"
                :items="[Object.keys(job.variants || {}).map((fmt) => ({ label: `Publish ${fmt}`, icon: 'i-lucide-share-2', onSelect: () => onPublishToSocial(job, String(fmt)) }))]"
              >
                <UButton icon="i-lucide-share-2" size="xs" variant="ghost" color="primary" label="Publish" />
              </UDropdownMenu>
              <UDropdownMenu
                v-if="job.status === 'done'"
                :items="[Object.keys(job.variants || {}).map((fmt) => ({ label: `Send ${fmt} to portal`, icon: 'i-lucide-send', onSelect: () => onSendToPortal(job, String(fmt)) }))]"
              >
                <UButton icon="i-lucide-send" size="xs" variant="ghost" color="neutral" label="To portal" />
              </UDropdownMenu>
              <UDropdownMenu
                v-if="job.status === 'done'"
                :items="[Object.keys(job.variants || {}).map((fmt) => ({ label: `Save ${fmt} to library`, icon: 'i-lucide-bookmark', onSelect: () => onSaveAsset(job, String(fmt)) }))]"
              >
                <UButton icon="i-lucide-bookmark" size="xs" variant="ghost" color="neutral" label="Library" />
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Asset picker slideover -->
  <MediaAssetPicker
    v-model:open="pickerOpen"
    @pick="onPickerPick"
  />

  <!-- Footage / still uploader -->
  <MediaMediaPicker v-model:open="mediaPickerOpen" :uploader="editor.uploadMedia" @uploaded="onMediaUploaded" />

  <!-- Overlay picker -->
  <MediaOverlayPicker v-model:open="overlayPickerOpen" @pick="onOverlayPick" />

  <!-- AI video generation picker -->
  <MediaGeneratePicker
    v-if="videoGenerationEnabled"
    v-model:open="generatePickerOpen"
    :project-id="projectId"
    :timeline-stills="timelineStills"
    :default-aspect="projectAspect"
    :initial-prompt="generationDraftPrompt"
    @submitted="onGenerationSubmitted"
  />

  <!-- AI video generation progress/status (queued/running/failed) -->
  <MediaGenerationStatus v-if="videoGenerationEnabled" :jobs="genJobs.jobs.value" />

  <MediaVideoLibrary v-model:open="libraryOpen" @publish="onLibraryPublish" @add-to-timeline="onLibraryAddToTimeline" @reuse-prompt="onReusePrompt" />

  <!-- Versions slideover -->
  <USlideover
    v-model:open="versionsOpen"
    title="Version history"
    description="Restore a previously-saved snapshot of this timeline."
  >
    <template #body>
      <div class="space-y-2">
        <div v-if="versionsLoading" class="space-y-2">
          <USkeleton v-for="n in 3" :key="n" class="h-14 w-full rounded-lg" />
        </div>

        <UAlert
          v-else-if="!versions.length"
          color="neutral"
          variant="subtle"
          icon="i-lucide-history"
          title="No saved versions"
          description="Use 'Save version' to checkpoint the current timeline."
        />

        <div
          v-for="version in versions"
          :key="version.id"
          class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ version.label ?? `Version ${version.version}` }}
            </p>
            <p class="text-xs text-muted mt-0.5 flex items-center gap-1.5">
              <UBadge :label="`v${version.version}`" size="xs" variant="subtle" color="neutral" />
              <span>{{ fmtVersionDate(version.createdAt) }}</span>
            </p>
          </div>
          <UButton
            icon="i-lucide-rotate-ccw"
            size="xs"
            variant="soft"
            color="primary"
            label="Restore"
            :loading="restoringId === version.id"
            @click="restore(version)"
          />
        </div>
      </div>
    </template>
  </USlideover>

  <!-- Save version modal -->
  <UModal v-model:open="saveVersionOpen" title="Save version">
    <template #content>
      <div class="p-4 space-y-4">
        <UFormField label="Version label">
          <UInput
            v-model="versionLabel"
            placeholder="e.g. Before final mix"
            autofocus
            @keydown.enter="doSaveVersion"
          />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="saveVersionOpen = false"
          />
          <UButton
            color="primary"
            label="Save snapshot"
            :loading="savingVersion"
            @click="doSaveVersion"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
