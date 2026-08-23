<script setup lang="ts">
// MediaTimeline.client.vue — SP2b read-only lane view PLUS SP2c interaction layer.
// SP2b read path (lanes, ruler, clip blocks via clipRect, playhead via playheadX) is
// preserved intact. SP2c adds: zoom control, click-to-select (ring highlight), drag-to-
// move with snap, trim handles, zoom/split/delete keyboard shortcuts, and per-clip
// wavesurfer.js waveform render (render-only — engine remains the clock).
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip, TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { clipRect, playheadX, timeAtX } from '~~/app/utils/audio/timelineGeometry'
import { snapTime } from '~~/app/utils/audio/timelineEdit'
import { toDisplayLanes, type DisplayClip } from '~~/app/utils/audio/timelineDisplay'
import { TIMELINE_ZOOM_OPTIONS, fitTimelineZoom, stepTimelineZoom } from '~~/app/utils/audio/timelineZoom'

// ─── Props & Emits ────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  timeline: TimelineState
  clips: ScheduledClip[]
  tracks: TrackBus[]
  currentTime: number
  duration: number
  pxPerSec?: number
  /** presigned URLs keyed by r2_key — for wavesurfer waveform render */
  sources?: Record<string, string>
}>(), {
  pxPerSec: 60,
  sources: () => ({})
})

const emit = defineEmits<{
  /** Clip selected (or deselected when clipId is null) */
  (e: 'select', payload: { clipId: string | null }): void
  /** Seek to a timeline position by clicking empty space */
  (e: 'seek', timeSec: number): void
  /** Clip was moved (possibly to a different track) */
  (e: 'move-clip', payload: { clipId: string; toTrackId: string; newStartSec: number }): void
  /** Clip edge was trimmed */
  (e: 'trim-clip', payload: { clipId: string; edge: 'start' | 'end'; newTimeSec: number }): void
  /** Clip sliced at playhead (or selected clip under playhead) */
  (e: 'slice', payload: { clipId: string; timeSec: number }): void
  /** Clip deleted */
  (e: 'delete-clip', payload: { clipId: string }): void
  /** Empty-lane affordance: the user wants to add media to this track */
  (e: 'add-to-track', payload: { trackId: string; kind: string }): void
}>()

const EMPTY_LANE_LABEL: Record<string, string> = {
  video: 'Add footage',
  overlay: 'Add overlay',
  caption: 'Add captions',
  voiceover: 'Add voiceover',
  music: 'Add music',
  audio: 'Add audio',
}
function emptyLaneLabel(lane: { kind: string; name: string }) {
  return EMPTY_LANE_LABEL[lane.kind] ?? EMPTY_LANE_LABEL[lane.name.toLowerCase()] ?? 'Add clip'
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const LANE_HEIGHT = 56
const LABEL_WIDTH = 120
const TRIM_HIT_PX = 8
const SNAP_THRESHOLD_PX = 8
const RULER_HEIGHT = 24

// ─── Zoom ─────────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(800)
const shortcutHelpOpen = ref(false)

const internalPxPerSec = ref(props.pxPerSec)

function fitToWindow() {
  internalPxPerSec.value = fitTimelineZoom(props.duration, containerWidth.value, LABEL_WIDTH)
}

function zoomIn() { internalPxPerSec.value = stepTimelineZoom(internalPxPerSec.value, 'in') }
function zoomOut() { internalPxPerSec.value = stepTimelineZoom(internalPxPerSec.value, 'out') }
function toggleShortcutHelp() { shortcutHelpOpen.value = !shortcutHelpOpen.value }
function closeShortcutHelp() { shortcutHelpOpen.value = false }

// Sync if the parent changes the prop after mount
watch(() => props.pxPerSec, (v) => { internalPxPerSec.value = v })

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.offsetWidth
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) containerWidth.value = e.contentRect.width
    })
    ro.observe(containerRef.value)
    onUnmounted(() => ro.disconnect())
  }
})

// ─── Derived geometry ─────────────────────────────────────────────────────────

const trackWidthPx = computed(() =>
  Math.max(props.duration, 1) * internalPxPerSec.value
)

const playheadLeft = computed(() =>
  LABEL_WIDTH + playheadX(props.currentTime, internalPxPerSec.value)
)

function rect(clip: DisplayClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  return clipRect(clip, internalPxPerSec.value, fallback)
}

function fmtDur(clip: DisplayClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  const d = clip.durationSec ?? fallback
  return `${d.toFixed(1)}s`
}

// ─── Lanes (one per track) ────────────────────────────────────────────────────

const lanes = computed(() => toDisplayLanes(props.timeline, props.clips))

/** Flat list of every display clip across all lanes — for interaction handlers. */
const allDisplayClips = computed<DisplayClip[]>(() => lanes.value.flatMap(l => l.clips))

// ─── Ruler ticks ─────────────────────────────────────────────────────────────

const rulerTicks = computed(() => {
  const pps = internalPxPerSec.value
  const dur = Math.max(props.duration, 1)
  // Choose a tick interval so there are at most ~30 ticks across the visible area
  const candidates = [0.25, 0.5, 1, 2, 5, 10, 30, 60]
  const interval = candidates.find(c => c * pps >= containerWidth.value / 30) ?? 60
  const ticks: { x: number; label: string }[] = []
  for (let t = 0; t <= dur + interval; t += interval) {
    const mins = Math.floor(t / 60)
    const secs = (t % 60).toFixed(0).padStart(2, '0')
    ticks.push({ x: LABEL_WIDTH + t * pps, label: mins > 0 ? `${mins}:${secs}` : `${secs}s` })
  }
  return ticks
})

// ─── Selection ────────────────────────────────────────────────────────────────

const selectedClipId = ref<string | null>(null)
const selectedDisplayClip = computed(() => selectedClipId.value
  ? allDisplayClips.value.find(clip => clip.clipId === selectedClipId.value) ?? null
  : null
)

function selectClip(clipId: string) {
  selectedClipId.value = clipId
  emit('select', { clipId })
}

function clearSelection() {
  selectedClipId.value = null
  emit('select', { clipId: null })
}

// ─── Snap targets ─────────────────────────────────────────────────────────────

function getSnapTargets(excludeClipId: string): number[] {
  const targets: number[] = [0, props.currentTime]
  for (const clip of allDisplayClips.value) {
    if (clip.clipId === excludeClipId) continue
    targets.push(clip.timelineStartSec)
    const end = clip.timelineStartSec + (clip.durationSec ?? Math.max(0, props.duration - clip.timelineStartSec))
    targets.push(end)
  }
  return targets
}

// ─── Drag state ──────────────────────────────────────────────────────────────

type DragMode = 'move' | 'trim-start' | 'trim-end'

interface DragState {
  mode: DragMode
  clipId: string
  /** screen-space x at pointer down */
  startScreenX: number
  /** original timeline_start_sec of the clip */
  origStartSec: number
  /** index of the source track lane */
  sourceLaneIdx: number
  /** live preview offset in px (CSS transform on the block) */
  previewDx: number
  /** live preview lane index offset */
  previewLaneOffset: number
}

const drag = ref<DragState | null>(null)

/** Returns the lane index that a given screenY falls in (accounting for ruler offset) */
function laneIndexAt(screenY: number): number {
  if (!containerRef.value) return 0
  const containerRect = containerRef.value.getBoundingClientRect()
  const relY = screenY - containerRect.top - RULER_HEIGHT
  return Math.max(0, Math.min(lanes.value.length - 1, Math.floor(relY / LANE_HEIGHT)))
}

function onClipPointerDown(event: PointerEvent, clip: DisplayClip, laneIdx: number, mode: DragMode) {
  // Don't interfere with click → handled via pointerup
  event.stopPropagation()
  // Select on any pointerdown
  selectClip(clip.clipId)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)

  drag.value = {
    mode,
    clipId: clip.clipId,
    startScreenX: event.screenX,
    origStartSec: clip.timelineStartSec,
    sourceLaneIdx: laneIdx,
    previewDx: 0,
    previewLaneOffset: 0
  }
}

function onPointerMove(event: PointerEvent) {
  if (!drag.value) return
  const d = drag.value
  const dx = event.screenX - d.startScreenX
  const laneIdx = laneIndexAt(event.clientY)
  d.previewDx = dx
  d.previewLaneOffset = laneIdx - d.sourceLaneIdx
  // trigger reactivity
  drag.value = { ...d }
}

/** Pointer travel below this is a click, not a drag — selection only, no edit. */
const DRAG_THRESHOLD_PX = 3

function onPointerUp(event: PointerEvent) {
  if (!drag.value) return
  const d = drag.value

  const dx = event.screenX - d.startScreenX
  const pps = internalPxPerSec.value
  const laneMoved = d.mode === 'move' && laneIndexAt(event.clientY) !== d.sourceLaneIdx
  if (Math.abs(dx) < DRAG_THRESHOLD_PX && !laneMoved) {
    // A click: the clip is already selected from pointerdown. Emitting a
    // zero-distance move would push a no-op undo step and trigger an autosave.
    drag.value = null
    return
  }

  if (d.mode === 'move') {
    const rawTimeSec = d.origStartSec + dx / pps
    const snapped = snapTime(rawTimeSec, getSnapTargets(d.clipId), pps, SNAP_THRESHOLD_PX)
    const targetLaneIdx = laneIndexAt(event.clientY)
    const targetTrack = lanes.value[targetLaneIdx]
    if (targetTrack) {
      emit('move-clip', {
        clipId: d.clipId,
        toTrackId: targetTrack.id,
        newStartSec: Math.max(0, snapped)
      })
    }
  } else {
    // trim-start or trim-end: newTimeSec in TIMELINE space
    const deltaSec = dx / pps
    const clip = allDisplayClips.value.find(c => c.clipId === d.clipId)
    if (clip) {
      if (d.mode === 'trim-start') {
        const rawTime = clip.timelineStartSec + deltaSec
        const snapped = snapTime(rawTime, getSnapTargets(d.clipId), pps, SNAP_THRESHOLD_PX)
        emit('trim-clip', { clipId: d.clipId, edge: 'start', newTimeSec: snapped })
      } else {
        const clipEnd = clip.timelineStartSec + (clip.durationSec ?? Math.max(0, props.duration - clip.timelineStartSec))
        const rawTime = clipEnd + deltaSec
        const snapped = snapTime(rawTime, getSnapTargets(d.clipId), pps, SNAP_THRESHOLD_PX)
        emit('trim-clip', { clipId: d.clipId, edge: 'end', newTimeSec: snapped })
      }
    }
  }
  drag.value = null
}

/** Get the live CSS style object for a clip block during drag */
function clipDragStyle(clipId: string): Record<string, string> {
  if (!drag.value || drag.value.clipId !== clipId || drag.value.mode !== 'move') return {}
  const dx = drag.value.previewDx
  const dy = drag.value.previewLaneOffset * LANE_HEIGHT
  return {
    transform: `translate(${dx}px, ${dy}px)`,
    zIndex: '30',
    opacity: '0.85'
  }
}

// ─── Lane click for seek ──────────────────────────────────────────────────────

function onLaneClick(event: MouseEvent) {
  if (!containerRef.value) return
  const containerRect = containerRef.value.getBoundingClientRect()
  const relX = event.clientX - containerRect.left - LABEL_WIDTH
  if (relX < 0) return
  const t = timeAtX(relX, internalPxPerSec.value)
  clearSelection()
  emit('seek', t)
}

// ─── Slice + Delete keyboard ──────────────────────────────────────────────────

/** Find the clip (if any) that contains the current playhead position */
function clipUnderPlayhead(): DisplayClip | null {
  for (const clip of allDisplayClips.value) {
    const end = clip.timelineStartSec + (clip.durationSec ?? Math.max(0, props.duration - clip.timelineStartSec))
    if (props.currentTime >= clip.timelineStartSec && props.currentTime < end) return clip
  }
  return null
}

const activeSplitClip = computed(() => selectedDisplayClip.value ?? clipUnderPlayhead())
const canSplitActiveClip = computed(() => activeSplitClip.value?.kind === 'audio')
const selectedClipHint = computed(() => {
  if (!selectedDisplayClip.value) return 'Select a clip to move, trim, split audio, replace, or delete.'
  if (selectedDisplayClip.value.kind === 'audio') return 'Drag clip edges to trim. Press S to split at the playhead, or Delete to remove.'
  return 'Drag clip edges to trim. Use the inspector below to replace or delete this clip.'
})

function handleSlice() {
  // Prefer the selected clip; fall back to whichever clip is under the playhead
  const clip = activeSplitClip.value
  if (!clip || clip.kind !== 'audio') return
  emit('slice', { clipId: clip.clipId, timeSec: props.currentTime })
}

function handleDelete() {
  if (!selectedClipId.value) return
  emit('delete-clip', { clipId: selectedClipId.value })
  selectedClipId.value = null
}

function onKeyDown(event: KeyboardEvent) {
  // Don't intercept while user is typing in an input
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
  if (event.key === '?' || (event.shiftKey && event.key === '/')) {
    event.preventDefault()
    toggleShortcutHelp()
    return
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomIn()
    return
  }
  if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    zoomOut()
    return
  }
  if (event.key === '0') {
    event.preventDefault()
    fitToWindow()
    return
  }
  if (event.key === 's' || event.key === 'S') {
    event.preventDefault()
    handleSlice()
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    handleDelete()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// ─── Waveforms (wavesurfer.js) ────────────────────────────────────────────────
// One WaveSurfer instance PER CLIP (keyed by clipId), so two clips sharing the
// same r2_key (e.g. the two halves of a slice) each render their own waveform
// into their own lane container. Never plays audio — the SP2a engine is the clock.

const waveInstances = new Map<string, WaveSurfer>()
const waveContainers = ref<Record<string, HTMLElement | null>>({})

function mountWaveform(clipId: string, r2Key: string, el: HTMLElement | null) {
  if (!el) return
  // Keyed by clipId so each clip renders its own waveform (slice → two clips,
  // same r2_key, both need a waveform).
  if (waveInstances.has(clipId)) return
  const url = props.sources?.[r2Key]
  if (!url) return

  const ws = WaveSurfer.create({
    container: el,
    url,
    interact: false,
    waveColor: 'rgba(255,255,255,0.5)',
    progressColor: 'rgba(255,255,255,0.15)',
    height: LANE_HEIGHT - 20,
    normalize: true,
    backend: 'WebAudio',
    // Never auto-play
    autoplay: false,
  })
  waveInstances.set(clipId, ws)
}

// Reactive: when new clips appear or sources become available, mount waveforms.
// Also tear down instances for clips that no longer exist (deleted / merged away).
watch(
  [() => props.clips, () => props.sources, lanes],
  () => {
    const liveClipIds = new Set(allDisplayClips.value.map(c => c.clipId))
    for (const [clipId, ws] of waveInstances) {
      if (!liveClipIds.has(clipId)) {
        try { ws.destroy() } catch { /* already gone */ }
        waveInstances.delete(clipId)
        delete waveContainers.value[clipId]
      }
    }
    for (const [clipId, el] of Object.entries(waveContainers.value)) {
      const clip = allDisplayClips.value.find(c => c.clipId === clipId)
      if (clip && clip.kind === 'audio' && clip.r2_key && el) mountWaveform(clipId, clip.r2_key, el)
    }
  },
  { deep: true }
)

onUnmounted(() => {
  for (const ws of waveInstances.values()) {
    try { ws.destroy() } catch { /* noop */ }
  }
  waveInstances.clear()
})
</script>

<template>
  <!-- Zoom toolbar -->
  <div class="relative mb-2 flex flex-wrap items-center gap-2 px-1">
    <div class="flex items-center gap-1.5">
      <UIcon name="i-lucide-zoom-in" class="size-3.5 text-muted" />
      <span class="text-xs font-medium text-muted">Zoom</span>
      <span class="rounded border border-default bg-default/40 px-1.5 py-0.5 text-[11px] leading-none text-muted">
        {{ Math.round(internalPxPerSec) }} px/s
      </span>
    </div>
    <UButton
      icon="i-lucide-minus"
      size="xs"
      variant="ghost"
      color="neutral"
      aria-label="Zoom out"
      title="Zoom out (-)"
      @click="zoomOut"
    />
    <USelect
      :model-value="internalPxPerSec"
      :items="TIMELINE_ZOOM_OPTIONS"
      value-key="value"
      size="xs"
      class="w-28"
      @update:model-value="(v: number) => (internalPxPerSec = v)"
    />
    <UButton
      icon="i-lucide-plus"
      size="xs"
      variant="ghost"
      color="neutral"
      aria-label="Zoom in"
      title="Zoom in (+)"
      @click="zoomIn"
    />
    <UButton
      icon="i-lucide-maximize-2"
      size="xs"
      variant="ghost"
      color="neutral"
      label="Fit timeline"
      title="Fit timeline (0)"
      @click="fitToWindow"
    />
    <UButton
      icon="i-lucide-keyboard"
      size="xs"
      variant="ghost"
      color="neutral"
      label="Shortcuts"
      title="Show timeline shortcuts (?)"
      @click="toggleShortcutHelp"
    />
    <div
      v-if="shortcutHelpOpen"
      class="absolute left-1 top-9 z-40 w-72 rounded-lg border border-default bg-elevated p-3 shadow-xl"
    >
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-xs font-medium uppercase text-muted">Timeline shortcuts</p>
        <UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" aria-label="Close shortcuts" @click="closeShortcutHelp" />
      </div>
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">+</kbd><span class="text-muted">Zoom in</span>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">-</kbd><span class="text-muted">Zoom out</span>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">0</kbd><span class="text-muted">Fit timeline</span>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">S</kbd><span class="text-muted">Split selected audio at playhead</span>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">Del</kbd><span class="text-muted">Delete selected clip</span>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">?</kbd><span class="text-muted">Show or hide shortcuts</span>
      </div>
    </div>
    <div class="flex min-w-56 items-center gap-1.5 rounded-md border border-default bg-default/40 px-2 py-1 text-[11px] text-muted">
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      <span class="truncate">{{ selectedClipHint }}</span>
    </div>
    <!-- Slice + Delete toolbar actions -->
    <div class="ml-auto flex items-center gap-2">
      <UButton
        icon="i-lucide-scissors"
        size="xs"
        variant="ghost"
        color="neutral"
        label="Split (S)"
        :disabled="!canSplitActiveClip"
        :title="canSplitActiveClip ? 'Split the selected audio clip at the playhead' : 'Split currently supports audio clips only'"
        @click="handleSlice"
      />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        variant="ghost"
        color="error"
        label="Delete"
        :disabled="!selectedClipId"
        title="Delete the selected clip"
        @click="handleDelete"
      />
    </div>
  </div>

  <!-- Timeline canvas -->
  <div
    ref="containerRef"
    class="relative overflow-x-auto rounded-lg border border-default bg-elevated select-none"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="() => (drag = null)"
  >
    <div
      class="relative"
      :style="{ width: `${LABEL_WIDTH + trackWidthPx}px`, minWidth: '100%' }"
    >
      <!-- Ruler row -->
      <div
        class="relative border-b border-default bg-default"
        :style="{ height: `${RULER_HEIGHT}px` }"
      >
        <!-- left label spacer -->
        <div
          class="absolute left-0 top-0 border-r border-default"
          :style="{ width: `${LABEL_WIDTH}px`, height: `${RULER_HEIGHT}px` }"
        />
        <!-- tick marks -->
        <div
          v-for="tick in rulerTicks"
          :key="tick.x"
          class="absolute top-0 flex flex-col items-start"
          :style="{ left: `${tick.x}px` }"
        >
          <div class="h-2 w-px bg-muted" />
          <span class="ml-1 text-[10px] text-muted leading-none">{{ tick.label }}</span>
        </div>
      </div>

      <!-- Track lanes -->
      <div
        v-for="(lane, laneIdx) in lanes"
        :key="lane.id"
        class="relative border-b border-default last:border-b-0 cursor-crosshair"
        :style="{ height: `${LANE_HEIGHT}px` }"
        @click="onLaneClick"
      >
        <!-- Sticky track label -->
        <div
          class="absolute left-0 top-0 z-10 flex h-full items-center gap-2 border-r border-default bg-elevated px-3"
          :style="{ width: `${LABEL_WIDTH}px` }"
        >
          <UIcon v-if="lane.muted" name="i-lucide-volume-x" class="size-4 text-muted" />
          <span
            class="truncate text-sm font-medium"
            :class="lane.muted ? 'text-muted' : 'text-highlighted'"
          >{{ lane.name }}</span>
        </div>

        <!-- Empty lane: invite, don't just leave a blank strip -->
        <button
          v-if="!lane.clips.length"
          type="button"
          class="absolute top-2 flex items-center gap-1.5 rounded-md border border-dashed border-default px-2.5 text-xs text-muted transition hover:border-primary/60 hover:text-highlighted"
          :style="{ left: `${LABEL_WIDTH + 8}px`, height: `${LANE_HEIGHT - 16}px` }"
          @click.stop="emit('add-to-track', { trackId: lane.id, kind: lane.kind })"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
          {{ emptyLaneLabel(lane) }}
        </button>

        <!-- Clips -->
        <div
          v-for="clip in lane.clips"
          :key="clip.clipId"
          class="absolute top-2 flex items-center rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
          :class="[
            clip.kind === 'video' ? 'bg-blue-600 dark:bg-blue-500'
              : clip.kind === 'overlay' ? 'bg-fuchsia-600 dark:bg-fuchsia-500'
                : clip.kind === 'caption' ? 'bg-amber-600 dark:bg-amber-500'
              : lane.muted ? 'bg-muted' : 'bg-primary',
            selectedClipId === clip.clipId ? 'ring-2 ring-white ring-offset-2 ring-offset-elevated shadow-lg' : 'hover:ring-1 hover:ring-white/60',
            drag?.clipId === clip.clipId ? 'transition-none' : 'transition-shadow'
          ]"
          :title="`${clip.label}: drag to move, drag edges to trim${clip.kind === 'audio' ? ', press S to split' : ''}`"
          :style="{
            left: `${LABEL_WIDTH + rect(clip).x}px`,
            width: `${rect(clip).width}px`,
            height: `${LANE_HEIGHT - 16}px`,
            ...clipDragStyle(clip.clipId)
          }"
          @pointerdown.stop="(e: PointerEvent) => onClipPointerDown(e, clip, laneIdx, 'move')"
          @click.stop
        >
          <!-- Trim handle — start (left edge) -->
          <div
            class="absolute left-0 top-0 h-full cursor-col-resize z-10 flex items-center justify-center bg-black/10 hover:bg-black/25"
            :style="{ width: `${TRIM_HIT_PX}px` }"
            title="Trim clip start"
            aria-label="Trim clip start"
            @pointerdown.stop="(e: PointerEvent) => onClipPointerDown(e, clip, laneIdx, 'trim-start')"
          >
            <div class="h-5 w-0.5 rounded-full bg-white/80 shadow" />
          </div>

          <!-- Audio: wavesurfer waveform -->
          <div
            v-if="clip.kind === 'audio'"
            :ref="(el) => { if (el) { waveContainers[clip.clipId] = el as HTMLElement; mountWaveform(clip.clipId, clip.r2_key as string, el as HTMLElement) } }"
            class="absolute inset-0 pointer-events-none overflow-hidden"
          />
          <!-- Video: icon strip -->
          <div v-else-if="clip.kind === 'video'" class="absolute inset-0 flex items-center gap-1 px-2 pointer-events-none">
            <UIcon :name="clip.baseSource === 'still_kenburns' ? 'i-lucide-image' : 'i-lucide-film'" class="size-3.5 text-inverted/80" />
          </div>
          <!-- Overlay: badge -->
          <div v-else-if="clip.kind === 'overlay'" class="absolute inset-0 flex items-center gap-1 px-2 pointer-events-none">
            <UIcon name="i-lucide-shapes" class="size-3.5 text-inverted/80" />
          </div>
          <!-- Captions: badge -->
          <div v-else class="absolute inset-0 flex items-center gap-1 px-2 pointer-events-none">
            <UIcon name="i-lucide-subtitles" class="size-3.5 text-inverted/80" />
          </div>

          <!-- Clip label -->
          <span class="relative z-10 truncate px-2 text-xs font-medium text-inverted ml-1">
            {{ clip.label }} · {{ fmtDur(clip) }}
          </span>

          <!-- Trim handle — end (right edge) -->
          <div
            class="absolute right-0 top-0 h-full cursor-col-resize z-10 flex items-center justify-center bg-black/10 hover:bg-black/25"
            :style="{ width: `${TRIM_HIT_PX}px` }"
            title="Trim clip end"
            aria-label="Trim clip end"
            @pointerdown.stop="(e: PointerEvent) => onClipPointerDown(e, clip, laneIdx, 'trim-end')"
          >
            <div class="h-5 w-0.5 rounded-full bg-white/80 shadow" />
          </div>
        </div>
      </div>

      <!-- Playhead -->
      <div
        class="pointer-events-none absolute z-20 w-px bg-primary"
        :style="{ left: `${playheadLeft}px`, top: `${RULER_HEIGHT}px`, height: `${lanes.length * LANE_HEIGHT}px` }"
      >
        <div class="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
      </div>
    </div>
  </div>
</template>
