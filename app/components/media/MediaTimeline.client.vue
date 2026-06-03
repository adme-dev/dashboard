<script setup lang="ts">
// MediaTimeline.client.vue — SP2b read-only lane view PLUS SP2c interaction layer.
// SP2b read path (lanes, ruler, clip blocks via clipRect, playhead via playheadX) is
// preserved intact. SP2c adds: zoom control, click-to-select (ring highlight), drag-to-
// move with snap, trim handles, "Split at playhead" + Delete keyboard shortcuts, and
// per-clip wavesurfer.js waveform render (render-only — engine remains the clock).
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip, TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { clipRect, playheadX, timeAtX } from '~~/app/utils/audio/timelineGeometry'
import { snapTime } from '~~/app/utils/audio/timelineEdit'

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
}>()

// ─── Layout constants ─────────────────────────────────────────────────────────

const LANE_HEIGHT = 56
const LABEL_WIDTH = 120
const TRIM_HIT_PX = 8
const SNAP_THRESHOLD_PX = 8
const RULER_HEIGHT = 24

// ─── Zoom ─────────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(800)

const internalPxPerSec = ref(props.pxPerSec)

// Zoom levels available in the USelect
const ZOOM_OPTIONS = [
  { label: '25 px/s', value: 25 },
  { label: '50 px/s', value: 50 },
  { label: '100 px/s', value: 100 },
  { label: '200 px/s', value: 200 },
  { label: '400 px/s', value: 400 },
]

function fitToWindow() {
  const dur = Math.max(props.duration, 1)
  const usable = Math.max(containerWidth.value - LABEL_WIDTH, 100)
  internalPxPerSec.value = Math.max(10, Math.floor(usable / dur))
}

function zoomIn() { internalPxPerSec.value = Math.min(800, internalPxPerSec.value * 1.5) }
function zoomOut() { internalPxPerSec.value = Math.max(10, internalPxPerSec.value / 1.5) }

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

function rect(clip: ScheduledClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  return clipRect(clip, internalPxPerSec.value, fallback)
}

function fmtDur(clip: ScheduledClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  const d = clip.durationSec ?? fallback
  return `${d.toFixed(1)}s`
}

// ─── Lanes (one per track) ────────────────────────────────────────────────────

const lanes = computed(() =>
  props.timeline.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    muted: t.muted,
    clips: props.clips.filter((c) => c.trackId === t.id)
  }))
)

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
  for (const clip of props.clips) {
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

function onClipPointerDown(event: PointerEvent, clip: ScheduledClip, laneIdx: number, mode: DragMode) {
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

function onPointerUp(event: PointerEvent) {
  if (!drag.value) return
  const d = drag.value

  const dx = event.screenX - d.startScreenX
  const pps = internalPxPerSec.value

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
    const clip = props.clips.find(c => c.clipId === d.clipId)
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
function clipUnderPlayhead(): ScheduledClip | null {
  for (const clip of props.clips) {
    const end = clip.timelineStartSec + (clip.durationSec ?? Math.max(0, props.duration - clip.timelineStartSec))
    if (props.currentTime >= clip.timelineStartSec && props.currentTime < end) return clip
  }
  return null
}

function handleSlice() {
  // Prefer the selected clip; fall back to whichever clip is under the playhead
  const clipId = selectedClipId.value
    ?? clipUnderPlayhead()?.clipId
    ?? null
  if (!clipId) return
  emit('slice', { clipId, timeSec: props.currentTime })
}

function handleDelete() {
  if (!selectedClipId.value) return
  emit('delete-clip', { clipId: selectedClipId.value })
  selectedClipId.value = null
}

function onKeyDown(event: KeyboardEvent) {
  // Don't intercept while user is typing in an input
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
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
// One WaveSurfer instance per r2_key, cached. Never plays audio — the SP2a engine
// is the clock. Only renders the waveform SVG/canvas.

const waveInstances = new Map<string, WaveSurfer>()
const waveContainers = ref<Record<string, HTMLElement | null>>({})

function mountWaveform(clipId: string, r2Key: string, el: HTMLElement | null) {
  if (!el) return
  // Keyed by r2_key so clips sharing the same asset reuse the same decode
  if (waveInstances.has(r2Key)) return
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
  waveInstances.set(r2Key, ws)
}

// Reactive: when new clips appear or sources become available, mount waveforms
watch(
  [() => props.clips, () => props.sources],
  () => {
    for (const [clipId, el] of Object.entries(waveContainers.value)) {
      const clip = props.clips.find(c => c.clipId === clipId)
      if (clip && el) mountWaveform(clipId, clip.r2_key, el)
    }
  },
  { deep: true }
)

onUnmounted(() => {
  for (const ws of waveInstances.values()) {
    try { ws.destroy() } catch {}
  }
  waveInstances.clear()
})
</script>

<template>
  <!-- Zoom toolbar -->
  <div class="mb-2 flex items-center gap-2 px-1">
    <span class="text-xs text-muted">Zoom</span>
    <UButton
      icon="i-lucide-minus"
      size="xs"
      variant="ghost"
      color="neutral"
      aria-label="Zoom out"
      @click="zoomOut"
    />
    <USelect
      :model-value="internalPxPerSec"
      :items="ZOOM_OPTIONS"
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
      @click="zoomIn"
    />
    <UButton
      icon="i-lucide-maximize-2"
      size="xs"
      variant="ghost"
      color="neutral"
      label="Fit"
      @click="fitToWindow"
    />
    <!-- Slice + Delete toolbar actions -->
    <div class="ml-auto flex items-center gap-2">
      <UButton
        icon="i-lucide-scissors"
        size="xs"
        variant="ghost"
        color="neutral"
        label="Split (S)"
        :disabled="!selectedClipId && !clipUnderPlayhead()"
        @click="handleSlice"
      />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        variant="ghost"
        color="error"
        label="Delete"
        :disabled="!selectedClipId"
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

        <!-- Clips -->
        <div
          v-for="clip in lane.clips"
          :key="clip.clipId"
          class="absolute top-2 flex items-center rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
          :class="[
            lane.muted ? 'bg-muted' : 'bg-primary',
            selectedClipId === clip.clipId ? 'ring-2 ring-white ring-offset-1' : '',
            drag?.clipId === clip.clipId ? 'transition-none' : 'transition-shadow'
          ]"
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
            class="absolute left-0 top-0 h-full cursor-col-resize z-10 flex items-center justify-center"
            :style="{ width: `${TRIM_HIT_PX}px` }"
            @pointerdown.stop="(e: PointerEvent) => onClipPointerDown(e, clip, laneIdx, 'trim-start')"
          >
            <div class="w-0.5 h-4 bg-white/60 rounded-full" />
          </div>

          <!-- Waveform container -->
          <div
            :ref="(el) => { if (el) { waveContainers[clip.clipId] = el as HTMLElement; mountWaveform(clip.clipId, clip.r2_key, el as HTMLElement) } }"
            class="absolute inset-0 pointer-events-none overflow-hidden"
          />

          <!-- Clip label (above waveform) -->
          <span class="relative z-10 truncate px-2 text-xs font-medium text-inverted ml-1">
            {{ clip.clipId }} · {{ fmtDur(clip) }}
          </span>

          <!-- Trim handle — end (right edge) -->
          <div
            class="absolute right-0 top-0 h-full cursor-col-resize z-10 flex items-center justify-center"
            :style="{ width: `${TRIM_HIT_PX}px` }"
            @pointerdown.stop="(e: PointerEvent) => onClipPointerDown(e, clip, laneIdx, 'trim-end')"
          >
            <div class="w-0.5 h-4 bg-white/60 rounded-full" />
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
