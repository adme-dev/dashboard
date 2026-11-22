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
import {
  TIMELINE_LANE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  horizontalScrollbarHeight,
  rulerTicks as buildRulerTicks,
  timelineNaturalHeight
} from '~~/app/utils/audio/timelineLayout'

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
  /** library titles keyed by r2_key (or overlay project id) — for clip labels */
  titles?: Record<string, string | undefined>
}>(), {
  sources: () => ({}),
  titles: () => ({})
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
  /** Height (px) needed to show every lane without scrolling — lets the dock size itself to the track count. */
  (e: 'natural-height', payload: { heightPx: number }): void
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

const LANE_HEIGHT = TIMELINE_LANE_HEIGHT
const LABEL_WIDTH = 120
const TRIM_HIT_PX = 8
const SNAP_THRESHOLD_PX = 8
const RULER_HEIGHT = TIMELINE_RULER_HEIGHT
/** Gap between the toolbar and the canvas (`gap-2`). */
const TOOLBAR_GAP_PX = 8

// ─── Zoom ─────────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const toolbarRef = ref<HTMLElement | null>(null)
const toolbarHeight = ref(0)
const scrollbarHeight = ref(0)
const shortcutHelpOpen = ref(false)

// A null manual zoom keeps the timeline fitted as media loads or the pane resizes.
const manualZoom = ref<number | null>(props.pxPerSec ?? null)
const internalPxPerSec = computed(() => manualZoom.value ?? (
  containerWidth.value && props.duration > 0
    ? fitTimelineZoom(props.duration, containerWidth.value, LABEL_WIDTH)
    : 60
))
const zoomLabel = computed(() => `${Number(internalPxPerSec.value.toPrecision(3))} px/s`)
const zoomOptions = computed(() => TIMELINE_ZOOM_OPTIONS.some(option => option.value === internalPxPerSec.value)
  ? TIMELINE_ZOOM_OPTIONS
  : [{ label: zoomLabel.value, value: internalPxPerSec.value }, ...TIMELINE_ZOOM_OPTIONS])

function fitToWindow() {
  manualZoom.value = null
}
function zoomIn() {
  manualZoom.value = stepTimelineZoom(internalPxPerSec.value, 'in')
}
function zoomOut() {
  manualZoom.value = stepTimelineZoom(internalPxPerSec.value, 'out')
}
function toggleShortcutHelp() { shortcutHelpOpen.value = !shortcutHelpOpen.value }
function closeShortcutHelp() { shortcutHelpOpen.value = false }

watch(() => props.pxPerSec, (v) => {
  manualZoom.value = v ?? null
})

onMounted(() => {
  if (containerRef.value) {
    const el = containerRef.value
    containerWidth.value = el.clientWidth
    scrollbarHeight.value = horizontalScrollbarHeight(el.offsetHeight, el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) containerWidth.value = e.contentRect.width
      // A classic scrollbar appears/disappears with zoom; overlay scrollbars measure 0.
      scrollbarHeight.value = horizontalScrollbarHeight(el.offsetHeight, el.clientHeight)
    })
    ro.observe(containerRef.value)
    onUnmounted(() => ro.disconnect())
  }
  if (toolbarRef.value) {
    // The toolbar wraps on narrow panes, so its height is measured rather than assumed.
    toolbarHeight.value = toolbarRef.value.offsetHeight
    const ro = new ResizeObserver(() => {
      if (toolbarRef.value) toolbarHeight.value = toolbarRef.value.offsetHeight
    })
    ro.observe(toolbarRef.value)
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

function clipIcon(clip: DisplayClip) {
  if (clip.kind === 'video') return clip.baseSource === 'still_kenburns' ? 'i-lucide-image' : 'i-lucide-film'
  return clip.kind === 'overlay' ? 'i-lucide-shapes' : 'i-lucide-subtitles'
}

function fmtDur(clip: DisplayClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  const d = clip.durationSec ?? fallback
  return `${d.toFixed(1)}s`
}

// ─── Lanes (one per track) ────────────────────────────────────────────────────

const lanes = computed(() => toDisplayLanes(props.timeline, props.clips, props.titles))

/** Flat list of every display clip across all lanes — for interaction handlers. */
const allDisplayClips = computed<DisplayClip[]>(() => lanes.value.flatMap(l => l.clips))

const naturalHeight = computed(() => timelineNaturalHeight(lanes.value.length, toolbarHeight.value + TOOLBAR_GAP_PX, scrollbarHeight.value))
watch(naturalHeight, heightPx => emit('natural-height', { heightPx }), { immediate: true })

// ─── Ruler ticks ─────────────────────────────────────────────────────────────

// Spacing follows zoom only, so labels stay readable when zoomed out or on a narrow phone pane.
const rulerTicks = computed(() => buildRulerTicks(props.duration, internalPxPerSec.value)
  .map(tick => ({ ...tick, x: LABEL_WIDTH + tick.sec * internalPxPerSec.value })))

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

/** Returns the lane index that a given clientY falls in (accounting for ruler and vertical scroll) */
function laneIndexAt(screenY: number): number {
  if (!containerRef.value) return 0
  const containerRect = containerRef.value.getBoundingClientRect()
  const relY = screenY - containerRect.top - RULER_HEIGHT + containerRef.value.scrollTop
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

/** Timeline second the drag would snap to right now, or null when free. Drives the snap guide. */
const snapGuideSec = ref<number | null>(null)

function onPointerMove(event: PointerEvent) {
  if (!drag.value) return
  const d = drag.value
  const dx = event.screenX - d.startScreenX
  const laneIdx = laneIndexAt(event.clientY)
  const pps = internalPxPerSec.value
  // Preview the snap so the user sees where the edge will land before releasing.
  const clip = allDisplayClips.value.find(c => c.clipId === d.clipId)
  let edgeSec: number | null = null
  if (clip) {
    if (d.mode === 'move') edgeSec = d.origStartSec + dx / pps
    else if (d.mode === 'trim-start') edgeSec = clip.timelineStartSec + dx / pps
    else edgeSec = clip.timelineStartSec + (clip.durationSec ?? Math.max(0, props.duration - clip.timelineStartSec)) + dx / pps
  }
  if (edgeSec !== null) {
    const snapped = snapTime(edgeSec, getSnapTargets(d.clipId), pps, SNAP_THRESHOLD_PX)
    snapGuideSec.value = snapped !== edgeSec ? snapped : null
    if (d.mode === 'move') d.previewDx = (snapped - d.origStartSec) * pps
    else d.previewDx = dx
  } else {
    d.previewDx = dx
  }
  d.previewLaneOffset = laneIdx - d.sourceLaneIdx
  // trigger reactivity
  drag.value = { ...d }
}

// ⌘/Ctrl + wheel zooms around the cursor; plain wheel keeps scrolling the page/dock.
function onWheel(event: WheelEvent) {
  if (!(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else if (event.deltaY > 0) zoomOut()
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
    snapGuideSec.value = null
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
  snapGuideSec.value = null
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
  const relX = event.clientX - containerRect.left - LABEL_WIDTH + containerRef.value.scrollLeft
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
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
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
  <!-- Own the vertical scroll so the ruler can stay sticky while lanes scroll. -->
  <div class="flex h-full min-h-0 flex-col gap-2">
    <!-- Zoom toolbar -->
    <div ref="toolbarRef" class="relative flex shrink-0 flex-wrap items-center gap-2 px-1">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-zoom-in" class="size-3.5 text-muted" />
        <span class="text-xs font-medium text-muted">Zoom</span>
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
        :items="zoomOptions"
        aria-label="Timeline zoom"
        value-key="value"
        size="xs"
        class="w-28"
        @update:model-value="(v: number) => (manualZoom = v)"
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
          <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-muted">⌘ + scroll</kbd><span class="text-muted">Zoom timeline</span>
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
          class="disabled:text-muted disabled:opacity-40"
          :disabled="!canSplitActiveClip"
          :title="canSplitActiveClip ? 'Split the selected audio clip at the playhead' : 'Split currently supports audio clips only'"
          @click="handleSlice"
        />
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          variant="ghost"
          :color="selectedClipId ? 'error' : 'neutral'"
          label="Delete"
          class="disabled:text-muted disabled:opacity-40"
          :disabled="!selectedClipId"
          :title="selectedClipId ? 'Delete the selected clip' : 'Select a clip to delete it'"
          @click="handleDelete"
        />
      </div>
    </div>

    <!-- Timeline canvas -->
    <div
      ref="containerRef"
      data-timeline-scroll
      class="relative min-h-0 flex-1 overflow-auto overscroll-x-contain rounded-lg border border-default bg-elevated select-none"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @wheel="onWheel"
      @pointercancel="() => (drag = null)"
    >
      <div
        class="relative"
        :style="{ width: `${LABEL_WIDTH + trackWidthPx}px`, minWidth: '100%' }"
      >
        <!-- Ruler row: sticky so time stays readable while lanes scroll vertically -->
        <div
          data-timeline-ruler
          class="sticky top-0 z-30 border-b border-default bg-default"
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
            :key="tick.sec"
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
            <div class="pointer-events-none relative flex w-full min-w-0 items-center gap-1.5 px-3 text-inverted">
              <UIcon
                v-if="clip.kind !== 'audio'"
                :name="clipIcon(clip)"
                class="size-3.5 shrink-0 opacity-80"
              />
              <!-- Audio labels sit on the waveform, so give the text its own dark backing in both themes. -->
              <span
                :data-clip-label="clip.kind"
                class="truncate text-xs font-medium"
                :class="clip.kind === 'audio' ? 'max-w-full rounded bg-black/75 px-1.5 py-0.5 text-white' : ''"
              >{{ clip.label }} · {{ fmtDur(clip) }}</span>
            </div>

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

        <!-- Snap guide: shows where a dragged edge will land -->
        <div
          v-if="snapGuideSec !== null"
          class="pointer-events-none absolute z-40 w-px border-l border-dashed border-white/80"
          :style="{ left: `${LABEL_WIDTH + playheadX(snapGuideSec, internalPxPerSec)}px`, top: `${RULER_HEIGHT}px`, height: `${lanes.length * LANE_HEIGHT}px` }"
        >
          <span class="absolute -top-5 left-1 rounded bg-white/90 px-1 text-[10px] font-medium tabular-nums text-black">{{ snapGuideSec.toFixed(2) }}s</span>
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
  </div>
</template>
