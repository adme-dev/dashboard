<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { layoutName } from '~/utils/banner-workspace'
import { LAYER_COLORS } from '~/utils/banner-constants'
import type { KeyframeProperty, Keyframe, Layer } from '~/types/banner-studio'
import { hasKeyframes, presetToKeyframes } from '~/composables/useBannerTimeline'
import { insertTimelineKeyframe, retimeLayerPresence } from '~/utils/banner-timeline-edit'
import { layerSlideId, resolveSlides, slideRanges } from '~/utils/banner-slides'
import { timelinePhases } from '~/utils/banner-timeline-phases'

const { state, activeLayers, activeFormat, selectLayer, updateLayer, duplicateLayer, removeLayer, bringToFront, sendToBack, getMotionPathTweens, updateMotionPathTween, addMotionPathTween, removeMotionPathTween } = useBannerStudio()
const { remoteLocks, isLayerLockedByOther } = useBannerRealtime()
const { inspectorTab } = useBannerInspector()
const { togglePlay, seekTo, restartTimeline, buildTimeline, pauseTimeline, currentLayerValue, animationPreview } = useBannerTimeline()
const { decomposingLayerId, decomposeFromUrl } = useDecompose()
const { isEditing: isAiEditing, openEdit: openAiEdit } = useAiLayerEdit()
const { isMerging, mergeLayers } = useMergeLayers()
const { openGenerate: openAiGenerate } = useAiImageGenerate()

// ── Layer context menu ──
const contextMenuLayer = ref<Layer | null>(null)
const contextMenuPos = ref({ x: 0, y: 0 })

function onLayerContextMenu(e: MouseEvent, layer: Layer) {
  e.preventDefault()
  contextMenuLayer.value = layer
  contextMenuPos.value = { x: e.clientX, y: e.clientY }
}

function handleContextDecompose(layer: Layer) {
  if (layer.src) {
    decomposeFromUrl(layer.src, layer.name, layer.id, 'layer')
  }
  contextMenuLayer.value = null
}

function handleContextDuplicate(layer: Layer) {
  duplicateLayer(layer.id)
  contextMenuLayer.value = null
}

function handleContextRemove(layer: Layer) {
  removeLayer(layer.id)
  contextMenuLayer.value = null
}

function handleContextBringToFront(layer: Layer) {
  bringToFront(layer.id)
  contextMenuLayer.value = null
}

function handleContextSendToBack(layer: Layer) {
  sendToBack(layer.id)
  contextMenuLayer.value = null
}

function handleContextEditWithAi(layer: Layer) {
  openAiEdit(layer)
  contextMenuLayer.value = null
}

function handleContextMergeLayers() {
  contextMenuLayer.value = null
  if (multiSelectedLayers.value.length >= 2) {
    mergeLayers(multiSelectedLayers.value)
    multiSelectedLayers.value = []
  }
}

function handleContextGenerateImage() {
  contextMenuLayer.value = null
  openAiGenerate()
}

// ── Multi-select ──
const multiSelectedLayers = ref<number[]>([])

function onLayerLabelClick(e: MouseEvent, layer: Layer) {
  if (layer.type === 'video') inspectorTab.value = 'properties'
  if (e.shiftKey) {
    // Toggle in multi-select
    const idx = multiSelectedLayers.value.indexOf(layer.id)
    if (idx >= 0) {
      multiSelectedLayers.value.splice(idx, 1)
    } else {
      multiSelectedLayers.value.push(layer.id)
    }
    // Also select the layer normally
    selectLayer(layer.id)
  } else {
    // Normal click — clear multi-select
    multiSelectedLayers.value = []
    selectLayer(layer.id)
  }
}

function isMultiSelected(layerId: number): boolean {
  return multiSelectedLayers.value.includes(layerId)
}

// ── Waveform cache for audio layers ──
const waveformCache = new Map<string, Float32Array>()
const waveformCanvases = ref<Map<number, HTMLCanvasElement>>(new Map())

async function getWaveform(src: string): Promise<Float32Array | null> {
  if (waveformCache.has(src)) return waveformCache.get(src)!
  try {
    const response = await fetch(src)
    const buffer = await response.arrayBuffer()
    const ctx = new AudioContext()
    const audio = await ctx.decodeAudioData(buffer)
    const data = audio.getChannelData(0)
    const points = 200
    const step = Math.floor(data.length / points)
    const peaks = new Float32Array(points)
    for (let i = 0; i < points; i++) {
      let max = 0
      for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
        max = Math.max(max, Math.abs(data[j]))
      }
      peaks[i] = max
    }
    waveformCache.set(src, peaks)
    await ctx.close()
    return peaks
  } catch { return null }
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: Float32Array, color: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = color
  const barW = Math.max(1, width / peaks.length)
  for (let i = 0; i < peaks.length; i++) {
    const barH = Math.max(1, peaks[i] * height * 0.9)
    const x = i * barW
    const y = (height - barH) / 2
    ctx.fillRect(x, y, Math.max(1, barW - 0.5), barH)
  }
}

function setWaveformCanvas(layerId: number, el: HTMLCanvasElement | null) {
  if (el) {
    waveformCanvases.value.set(layerId, el)
  }
}

// Render waveforms when audio layers change
watch(
  () => activeLayers.value.filter(l => l.type === 'audio').map(l => ({ id: l.id, src: l.src })),
  async (audioLayers) => {
    for (const al of audioLayers) {
      if (!al.src) continue
      const peaks = await getWaveform(al.src)
      if (!peaks) continue
      // Wait a tick for canvas to mount
      await nextTick()
      const canvas = waveformCanvases.value.get(al.id)
      if (canvas) drawWaveform(canvas, peaks, 'rgba(255, 255, 255, 0.5)')
    }
  },
  { immediate: true, deep: true }
)

const timelineEl = ref<HTMLElement | null>(null)
const rulerEl = ref<HTMLElement | null>(null)
const isDraggingPlayhead = ref(false)

watch(() => state.selectedLayerId, async (id) => {
  await nextTick()
  const container = timelineEl.value
  const row = container?.querySelector<HTMLElement>(`[data-layer-label="${id}"]`)
  if (!container || !row) return
  const viewport = container.getBoundingClientRect()
  const bounds = row.getBoundingClientRect()
  if (bounds.top < viewport.top + RULER_H) container.scrollTop += bounds.top - viewport.top - RULER_H
  else if (bounds.bottom > viewport.bottom) container.scrollTop += bounds.bottom - viewport.bottom
})

// Keyframe property labels
const KF_PROPERTIES: { key: KeyframeProperty, label: string, icon: string }[] = [
  { key: 'opacity', label: 'Opacity', icon: 'O' },
  { key: 'x', label: 'X', icon: 'X' },
  { key: 'y', label: 'Y', icon: 'Y' },
  { key: 'scaleX', label: 'Scale X', icon: 'Sx' },
  { key: 'scaleY', label: 'Scale Y', icon: 'Sy' },
  { key: 'rotation', label: 'Rotation', icon: 'R' }
]

/** Unique tween boundary times for a layer's motion path (keyframe diamonds) */
function tweenBoundaryTimes(layer: any): number[] {
  const tws = getMotionPathTweens(layer)
  return [...new Set(tws.flatMap(t => [t.startTime, t.endTime]))]
}

/** Get visible KF properties for a layer — hides x/y when motion path is active */
function getVisibleKfProperties(layer: { motionPath?: any[] }) {
  if (layer.motionPath?.length >= 2) {
    return KF_PROPERTIES.filter(p => p.key !== 'x' && p.key !== 'y')
  }
  return KF_PROPERTIES
}

function sceneBounds(layer: Layer) {
  const board = state.sets[state.activeKey]
  const owner = slideRanges(resolveSlides(board)).find(slide => slide.id === layerSlideId(board, layer))
  return owner || { start: 0, end: state.duration }
}

// Layers sorted by zIndex descending for lane display
const sortedLayers = computed(() => {
  return activeLayers.value.filter(layer => !layer.slideTransitionFor).sort((a, b) => b.zIndex - a.zIndex)
})

// Check if a layer is targeted by any mask
function isMaskedLayer(layerId: number): boolean {
  return activeLayers.value.some(l => l.isMask && l.maskTargetIds?.includes(layerId))
}

// ── Zoom ──────────────────────────────
const pxPerSec = ref(120)
const ZOOM_MIN = 40
const ZOOM_MAX = 400
const ZOOM_STEP = 20

function zoomIn() {
  pxPerSec.value = Math.min(ZOOM_MAX, pxPerSec.value + ZOOM_STEP)
}
function zoomOut() {
  pxPerSec.value = Math.max(ZOOM_MIN, pxPerSec.value - ZOOM_STEP)
}
function onWheelZoom(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}
const zoomPercent = computed(() => Math.round(pxPerSec.value / 120 * 100))

// ── Center on playhead ───────────────
function centerOnPlayhead() {
  const container = timelineEl.value
  if (!container) return
  const playheadPx = state.currentTime * pxPerSec.value + LABEL_W
  const viewWidth = container.clientWidth
  container.scrollLeft = Math.max(0, playheadPx - viewWidth / 2)
}

// ── Loop range drag ──────────────────
const loopDrag = ref<{ startTime: number, active: boolean } | null>(null)

function clearLoopRange() {
  state.loopIn = null
  state.loopOut = null
}

// ── Stretch indicator ────────────────
const stretchLabel = ref<{ x: number, y: number, text: string } | null>(null)

// ── Constants ─────────────────────────
const LANE_H = 36
const laneHeight = (layer: Layer) => layer.type === 'video' ? 48 : LANE_H
const KF_TRACK_H = 20
const RULER_H = 32
const LABEL_W = 256
const LAYER_ICONS: Record<Layer['type'], string> = {
  text: 'i-lucide-type',
  image: 'i-lucide-image',
  video: 'i-lucide-video',
  rect: 'i-lucide-square',
  button: 'i-lucide-mouse-pointer-click',
  bg: 'i-lucide-panels-top-left',
  audio: 'i-lucide-music-2'
}

/** Get height for a layer lane (main + expanded keyframe tracks) */
function getLaneHeight(layerId: number): number {
  const layer = activeLayers.value.find(l => l.id === layerId)
  const height = layer ? laneHeight(layer) : LANE_H
  if (state.expandedKeyframeLayers.has(layerId)) {
    const props = layer ? getVisibleKfProperties(layer) : KF_PROPERTIES
    // Add 1 extra track for "Path" sub-track when motion path is active
    const extraTrack = (layer?.motionPath?.length ?? 0) >= 2 ? 1 : 0
    return height + (props.length + extraTrack) * KF_TRACK_H
  }
  return height
}

// Total timeline width
const timelineWidth = computed(() => Math.max(600, state.duration * pxPerSec.value + 60))

// Time ruler marks
const rulerMarks = computed(() => {
  const marks: { time: number, x: number, label: string | null }[] = []
  const step = 0.1
  for (let t = 0; t <= state.duration + 0.5; t += step) {
    const rounded = Math.round(t * 10) / 10
    marks.push({
      time: rounded,
      x: rounded * pxPerSec.value,
      label: rounded % 1 === 0 ? `${rounded}s` : null
    })
  }
  return marks
})

// Playhead position
const playheadX = computed(() => state.currentTime * pxPerSec.value)

function getLayerColor(layer: { type: string }): string {
  return ({ text: '#7963ca', image: '#705318', rect: '#4578b9', button: '#7963ca', bg: '#777b85', video: '#705318', audio: '#b66c8f' } as Record<string, string>)[layer.type] || LAYER_COLORS[0]
}

const phasesByLayer = computed(() => new Map(activeLayers.value.map(layer => [layer.id, timelinePhases(layer)])))
const { startPhaseDrag, phaseClick, nudgePhase, timingHint } = useBannerPhaseDrag(pxPerSec, phasesByLayer)
const selectedTimelineLayer = computed(() => activeLayers.value.find(layer => layer.id === state.selectedLayerId))
const keyframeProperty = ref<KeyframeProperty>('opacity')
const keyframeMenuOpen = ref(false)
function canEditTiming(layer: Layer) {
  return !layer.locked && !isLayerLockedByOther(layer.id)
}
function insertKeyframe(layer: Layer, prop: KeyframeProperty, at: number) {
  if (!canEditTiming(layer) || layer.type === 'audio') return
  pauseTimeline()
  const time = Math.round(Math.max(layer.startTime ?? 0, Math.min(layer.endTime ?? state.duration, at)) * 100) / 100
  seekTo(time)
  const value = currentLayerValue(layer, prop)
  const source = hasKeyframes(layer) ? layer.keyframes : presetToKeyframes(layer)
  const next = insertTimelineKeyframe(layer, prop, time, value, source)
  if (next.changed || !hasKeyframes(layer)) updateLayer(layer.id, { keyframes: next.keyframes })
  selectLayer(layer.id)
  state.expandedKeyframeLayers.add(layer.id)
  state.selectedKeyframe = { layerId: layer.id, property: prop, index: next.index }
  inspectorTab.value = 'animation'
  keyframeMenuOpen.value = false
}

function onPhaseClick(event: MouseEvent) {
  if (justFinishedDrag) {
    event.preventDefault()
    event.stopImmediatePropagation()
    justFinishedDrag = false
    return
  }
  phaseClick(event)
}
const animationPickers = new Map<number, { openPicker: () => void }>()
function setAnimationPicker(id: number, picker: unknown) {
  if (picker) animationPickers.set(id, picker as { openPicker: () => void })
  else animationPickers.delete(id)
}

function onPresenceBarClick(layer: Layer) {
  if (justFinishedDrag) {
    justFinishedDrag = false
    return
  }
  selectLayer(layer.id)
  if (layer.type === 'video') {
    inspectorTab.value = 'properties'
    return
  }
  animationPickers.get(layer.id)?.openPicker()
}

// ── Ruler / Playhead drag ─────────────
function rulerTimeFromEvent(e: MouseEvent): number {
  const rect = rulerEl.value?.getBoundingClientRect()
  if (!rect) return 0
  const x = e.clientX - rect.left
  return Math.max(0, Math.min(state.duration, x / pxPerSec.value))
}

function onRulerMouseDown(e: MouseEvent) {
  if (e.altKey) {
    // Alt+drag → define loop range
    const startTime = rulerTimeFromEvent(e)
    loopDrag.value = { startTime, active: true }
    state.loopIn = startTime
    state.loopOut = startTime
    window.addEventListener('mousemove', onLoopDragMove)
    window.addEventListener('mouseup', onLoopDragUp)
    return
  }
  isDraggingPlayhead.value = true
  seekTo(rulerTimeFromEvent(e))
  window.addEventListener('mousemove', onPlayheadDrag)
  window.addEventListener('mouseup', onPlayheadUp)
}

function onPlayheadDrag(e: MouseEvent) {
  if (!isDraggingPlayhead.value) return
  seekTo(rulerTimeFromEvent(e))
}

function onPlayheadUp() {
  isDraggingPlayhead.value = false
  window.removeEventListener('mousemove', onPlayheadDrag)
  window.removeEventListener('mouseup', onPlayheadUp)
}

// ── Loop range drag handlers ─────────
function onLoopDragMove(e: MouseEvent) {
  const d = loopDrag.value
  if (!d) return
  const current = rulerTimeFromEvent(e)
  state.loopIn = Math.min(d.startTime, current)
  state.loopOut = Math.max(d.startTime, current)
}

function onLoopDragUp() {
  const d = loopDrag.value
  if (d) {
    // If the range is too small (< 0.1s), clear it
    if (state.loopIn != null && state.loopOut != null && state.loopOut - state.loopIn < 0.1) {
      clearLoopRange()
    } else {
      state.isLooping = true
    }
  }
  loopDrag.value = null
  window.removeEventListener('mousemove', onLoopDragMove)
  window.removeEventListener('mouseup', onLoopDragUp)
}

function onTrackClick(e: MouseEvent) {
  // Don't seek if we just finished a presence drag
  if (justFinishedDrag) {
    justFinishedDrag = false
    return
  }
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const time = Math.max(0, Math.min(state.duration, x / pxPerSec.value))
  seekTo(time)
}

function formatTime(t: number): string {
  const secs = Math.floor(t)
  const ms = Math.round((t - secs) * 10)
  return `${secs}.${ms}s`
}

// ── Snap-to-grid ──────────────────────
const SNAP_THRESHOLD = 5 // pixels
function snapTime(time: number): number {
  const gridStep = 0.25
  const snapped = Math.round(time / gridStep) * gridStep
  const snapPx = Math.abs((snapped - time) * pxPerSec.value)
  return snapPx < SNAP_THRESHOLD ? snapped : time
}

// ── Presence bar drag ─────────────────
const presenceDrag = ref<{
  layerId: number
  mode: 'start' | 'end' | 'move'
  origStart: number
  origEnd: number
  startX: number
  barEl: HTMLElement | null
  original: Layer
  key: string
} | null>(null)

let justFinishedDrag = false
let dragClickReset: ReturnType<typeof setTimeout> | null = null

function onPresenceMouseDown(e: MouseEvent, layerId: number, mode: 'start' | 'end' | 'move') {
  e.stopPropagation()
  e.preventDefault()
  const layer = activeLayers.value.find(l => l.id === layerId)
  if (!layer || !canEditTiming(layer) || e.button !== 0) return
  pauseTimeline()
  selectLayer(layer.id)

  presenceDrag.value = {
    layerId,
    original: structuredClone(toRaw(layer)),
    key: state.activeKey,
    mode,
    origStart: layer.startTime || 0,
    origEnd: layer.endTime || 3,
    startX: e.clientX,
    barEl: (e.currentTarget as HTMLElement).closest('.presence-bar-group') as HTMLElement
  }

  window.addEventListener('blur', cancelPresence)
  window.addEventListener('mousemove', onPresenceMouseMove)
  window.addEventListener('mouseup', onPresenceMouseUp)
}

function cancelPresence() {
  const d = presenceDrag.value
  if (d?.barEl) {
    d.barEl.style.left = `${d.origStart * pxPerSec.value}px`
    d.barEl.style.width = `${(d.origEnd - d.origStart) * pxPerSec.value}px`
  }
  presenceDrag.value = null
  stretchLabel.value = null
  window.removeEventListener('mousemove', onPresenceMouseMove)
  window.removeEventListener('mouseup', onPresenceMouseUp)
  window.removeEventListener('blur', cancelPresence)
}
watch(() => [state.activeKey, state.project?.id], cancelPresence)
function onPresenceMouseMove(e: MouseEvent) {
  const d = presenceDrag.value
  if (!d) return

  if (state.activeKey !== d.key || !canEditTiming(d.original)) return cancelPresence()
  const dx = e.clientX - d.startX
  if (Math.abs(dx) <= 3) return
  const dt = dx / pxPerSec.value

  let newStart = d.origStart
  let newEnd = d.origEnd

  if (d.mode === 'start') {
    newStart = snapTime(Math.max(0, d.origStart + dt))
    if (newStart > newEnd - 0.1) newStart = newEnd - 0.1
  } else if (d.mode === 'end') {
    newEnd = Math.min(state.duration, snapTime(Math.max(d.origStart + 0.1, d.origEnd + dt)))
  } else {
    // move — shift both equally
    const duration = d.origEnd - d.origStart
    newStart = Math.min(state.duration - duration, snapTime(Math.max(0, d.origStart + dt)))
    newEnd = newStart + duration
  }

  const bounds = sceneBounds(d.original)
  if (d.mode === 'move') {
    newStart = Math.max(bounds.start, Math.min(bounds.end - (d.origEnd - d.origStart), newStart))
    newEnd = newStart + d.origEnd - d.origStart
  } else {
    newStart = Math.max(bounds.start, newStart)
    newEnd = Math.min(bounds.end, newEnd)
  }

  // Direct DOM mutation for 60fps during drag
  if (d.barEl) {
    d.barEl.style.left = `${newStart * pxPerSec.value}px`
    d.barEl.style.width = `${(newEnd - newStart) * pxPerSec.value}px`
  }

  // Stretch ratio indicator (Feature 5)
  if (d.mode === 'start' || d.mode === 'end') {
    const origDuration = d.origEnd - d.origStart
    const newDuration = newEnd - newStart
    const ratio = newDuration / origDuration
    if (Math.abs(ratio - 1) > 0.05) {
      const edgePx = (d.mode === 'end' ? newEnd : newStart) * pxPerSec.value
      stretchLabel.value = {
        x: edgePx,
        y: 0, // positioned via template
        text: `\u00d7${ratio.toFixed(1)}`
      }
    } else {
      stretchLabel.value = null
    }
  }
}

function onPresenceMouseUp(e: MouseEvent) {
  const d = presenceDrag.value
  if (d && (state.activeKey !== d.key || !canEditTiming(activeLayers.value.find(layer => layer.id === d.layerId) || d.original))) return cancelPresence()
  if (d) {
    const dx = e.clientX - d.startX
    const dt = dx / pxPerSec.value

    let newStart = d.origStart
    let newEnd = d.origEnd

    if (d.mode === 'start') {
      newStart = snapTime(Math.max(0, d.origStart + dt))
      if (newStart > newEnd - 0.1) newStart = newEnd - 0.1
    } else if (d.mode === 'end') {
      newEnd = Math.min(state.duration, snapTime(Math.max(d.origStart + 0.1, d.origEnd + dt)))
    } else {
      const duration = d.origEnd - d.origStart
      newStart = Math.max(0, Math.min(state.duration - duration, snapTime(Math.max(0, d.origStart + dt))))
      newEnd = newStart + duration
    }

    const bounds = sceneBounds(d.original)
    if (d.mode === 'move') {
      newStart = Math.max(bounds.start, Math.min(bounds.end - (d.origEnd - d.origStart), newStart))
      newEnd = newStart + d.origEnd - d.origStart
    } else {
      newStart = Math.max(bounds.start, newStart)
      newEnd = Math.min(bounds.end, newEnd)
    }

    // Round to 2 decimal places for clean values
    newStart = Math.round(newStart * 100) / 100
    newEnd = Math.round(newEnd * 100) / 100

    // A click opens the pop-up; it must not snap fractional imported times or dirty the project.
    if (Math.abs(dx) <= 3) {
      newStart = d.origStart
      newEnd = d.origEnd
    } else if (newStart !== d.origStart || newEnd !== d.origEnd) {
      updateLayer(d.layerId, retimeLayerPresence(d.original, newStart, newEnd))
    }

    // Keep the final geometry even when Vue has no reactive change to patch.
    if (d.barEl) {
      d.barEl.style.left = `${newStart * pxPerSec.value}px`
      d.barEl.style.width = `${(newEnd - newStart) * pxPerSec.value}px`
    }

    justFinishedDrag = Math.abs(dx) > 3
    if (dragClickReset) clearTimeout(dragClickReset)
    dragClickReset = setTimeout(() => {
      justFinishedDrag = false
    }, 0)
  }

  presenceDrag.value = null
  stretchLabel.value = null
  window.removeEventListener('mousemove', onPresenceMouseMove)
  window.removeEventListener('mouseup', onPresenceMouseUp)
  window.removeEventListener('blur', cancelPresence)
}

// ── Crossfade zones ───────────────────
const crossfadeZones = computed(() => {
  const bgs = sortedLayers.value
    .filter(l => l.type === 'bg')
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
  const zones: { start: number, end: number }[] = []
  for (let i = 0; i < bgs.length - 1; i++) {
    const a = bgs[i], b = bgs[i + 1]
    const overlapStart = Math.max(a.startTime || 0, b.startTime || 0)
    const overlapEnd = Math.min(a.endTime || 3, b.endTime || 3)
    if (overlapStart < overlapEnd) {
      zones.push({ start: overlapStart, end: overlapEnd })
    }
  }
  return zones
})

// ── Keyframe expand/collapse ──────────
function toggleKeyframeLanes(layerId: number) {
  if (state.expandedKeyframeLayers.has(layerId)) {
    state.expandedKeyframeLayers.delete(layerId)
  } else {
    state.expandedKeyframeLayers.add(layerId)
  }
}

// ── Keyframe interactions ─────────────
function getLayerKeyframes(layerId: number, prop: KeyframeProperty): Keyframe[] {
  const layer = activeLayers.value.find(l => l.id === layerId)
  if (!layer?.keyframes?.[prop]) return []
  return [...layer.keyframes[prop]!].sort((a, b) => a.time - b.time)
}

function isKeyframeSelected(layerId: number, prop: string, idx: number): boolean {
  const s = state.selectedKeyframe
  return s !== null && s.layerId === layerId && s.property === prop && s.index === idx
}

function selectKeyframe(layerId: number, prop: string, idx: number, e: MouseEvent) {
  e.stopPropagation()
  selectLayer(layerId)
  state.selectedKeyframe = { layerId, property: prop, index: idx }
  inspectorTab.value = 'animation'
}

function addKeyframeAtClick(e: MouseEvent, layerId: number, prop: KeyframeProperty) {
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const time = Math.round(Math.max(0, x / pxPerSec.value) * 100) / 100

  const layer = activeLayers.value.find(l => l.id === layerId)
  if (layer) insertKeyframe(layer, prop, time)
}

// ── Keyframe drag ─────────────────────
const kfDrag = ref<{
  layerId: number
  prop: KeyframeProperty
  index: number
  origTime: number
  sourceIndex: number
  key: string
  startX: number
  diamondEl: HTMLElement | null
} | null>(null)

function onKeyframeDragStart(e: MouseEvent, layerId: number, prop: KeyframeProperty, idx: number) {
  e.stopPropagation()
  e.preventDefault()
  const layer = activeLayers.value.find(layer => layer.id === layerId)
  if (!layer || !canEditTiming(layer)) return
  pauseTimeline()
  const kfs = getLayerKeyframes(layerId, prop)
  if (!kfs[idx]) return

  kfDrag.value = {
    layerId,
    prop,
    index: idx,
    origTime: kfs[idx].time,
    sourceIndex: layer.keyframes![prop]!.indexOf(kfs[idx]),
    key: state.activeKey,
    startX: e.clientX,
    diamondEl: e.currentTarget as HTMLElement
  }

  selectLayer(layerId)
  state.selectedKeyframe = { layerId, property: prop, index: idx }
  inspectorTab.value = 'animation'
  window.addEventListener('blur', cancelKeyframeDrag)
  window.addEventListener('mousemove', onKeyframeDragMove)
  window.addEventListener('mouseup', onKeyframeDragEnd)
}

function cancelKeyframeDrag() {
  const d = kfDrag.value
  if (d?.diamondEl) d.diamondEl.style.left = `${d.origTime * pxPerSec.value - 5}px`
  kfDrag.value = null
  window.removeEventListener('mousemove', onKeyframeDragMove)
  window.removeEventListener('mouseup', onKeyframeDragEnd)
  window.removeEventListener('blur', cancelKeyframeDrag)
}
watch(() => [state.activeKey, state.project?.id], cancelKeyframeDrag)
function onKeyframeDragMove(e: MouseEvent) {
  const d = kfDrag.value
  if (!d || !d.diamondEl) return
  const layer = activeLayers.value.find(layer => layer.id === d.layerId)
  if (state.activeKey !== d.key || !layer || !canEditTiming(layer)) return cancelKeyframeDrag()
  const dx = e.clientX - d.startX
  const dt = dx / pxPerSec.value
  const newTime = snapTime(Math.max(0, Math.min(state.duration, d.origTime + dt)))
  // Direct DOM move for smooth 60fps
  d.diamondEl.style.left = `${newTime * pxPerSec.value - 5}px`
}

function onKeyframeDragEnd(e: MouseEvent) {
  const d = kfDrag.value
  if (d && (state.activeKey !== d.key || !activeLayers.value.some(layer => layer.id === d.layerId && canEditTiming(layer)))) return cancelKeyframeDrag()
  if (d) {
    const dx = e.clientX - d.startX
    const dt = dx / pxPerSec.value
    const newTime = Math.round(snapTime(Math.max(0, Math.min(state.duration, d.origTime + dt))) * 100) / 100

    const layer = activeLayers.value.find(l => l.id === d.layerId)
    if (layer?.keyframes?.[d.prop]) {
      const updated = [...layer.keyframes[d.prop]!]
      const index = d.sourceIndex
      if (Math.abs(dx) > 3 && newTime !== d.origTime && index >= 0 && !updated.some((frame, i) => i !== index && Math.abs(frame.time - newTime) < 0.0001)) {
        updated[index] = { ...updated[index], time: newTime }
        updated.sort((a, b) => a.time - b.time)
        updateLayer(d.layerId, {
          keyframes: { ...layer.keyframes, [d.prop]: updated }
        })
        // Update selected index after sort
        const newIdx = updated.findIndex(kf => kf.time === newTime)
        state.selectedKeyframe = { layerId: d.layerId, property: d.prop, index: newIdx }
      }
    }

    // Reset direct DOM mutation
    if (d.diamondEl) d.diamondEl.style.left = ''
  }
  kfDrag.value = null
  window.removeEventListener('mousemove', onKeyframeDragMove)
  window.removeEventListener('mouseup', onKeyframeDragEnd)
  window.removeEventListener('blur', cancelKeyframeDrag)
}

function nudgeKeyframe(event: KeyboardEvent, layerId: number, prop: KeyframeProperty, index: number) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const layer = activeLayers.value.find(layer => layer.id === layerId)
  if (!layer || !canEditTiming(layer)) return
  const frames = getLayerKeyframes(layerId, prop)
  const frame = frames[index]
  if (!frame) return
  const time = Math.round(Math.max(0, Math.min(state.duration, frame.time + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.5 : 0.05))) * 100) / 100
  if (time === frame.time) return
  if (frames.some((other, i) => i !== index && Math.abs(other.time - time) < 0.0001)) return
  const updated = frames.map((other, i) => i === index ? { ...other, time } : { ...other }).sort((a, b) => a.time - b.time)
  updateLayer(layerId, { keyframes: { ...layer.keyframes, [prop]: updated } })
  state.selectedKeyframe = { layerId, property: prop, index: updated.findIndex(frame => frame.time === time) }
}

// ── Motion path tween drag ──────────
const tweenDrag = ref<{
  layerId: number
  tweenIndex: number
  mode: 'start' | 'end' | 'move'
  origStart: number
  origEnd: number
  startX: number
  barEl: HTMLElement | null
} | null>(null)

// Tween selection lives in shared state so the canvas waypoints + inspector stay in sync
const selectedTween = computed({
  get: () => state.selectedTween,
  set: (v) => { state.selectedTween = v }
})

function onTweenDragStart(e: MouseEvent, layerId: number, tweenIndex: number, mode: 'start' | 'end' | 'move') {
  e.stopPropagation()
  e.preventDefault()
  const layer = activeLayers.value.find(l => l.id === layerId)
  if (!layer) return
  const tweens = getMotionPathTweens(layer)
  const tw = tweens[tweenIndex]
  if (!tw) return

  tweenDrag.value = {
    layerId,
    tweenIndex,
    mode,
    origStart: tw.startTime,
    origEnd: tw.endTime,
    startX: e.clientX,
    barEl: (e.currentTarget as HTMLElement).closest('.tween-bar') as HTMLElement
  }
  selectedTween.value = { layerId, tweenIndex }
  selectLayer(layerId)

  window.addEventListener('mousemove', onTweenDragMove)
  window.addEventListener('mouseup', onTweenDragEnd)
}

function onTweenDragMove(e: MouseEvent) {
  const d = tweenDrag.value
  if (!d || !d.barEl) return
  const dx = e.clientX - d.startX
  const dt = dx / pxPerSec.value

  let newStart = d.origStart
  let newEnd = d.origEnd

  if (d.mode === 'start') {
    newStart = snapTime(Math.max(0, d.origStart + dt))
    if (newStart > newEnd - 0.05) newStart = newEnd - 0.05
  } else if (d.mode === 'end') {
    newEnd = snapTime(Math.max(d.origStart + 0.05, d.origEnd + dt))
  } else {
    const dur = d.origEnd - d.origStart
    newStart = snapTime(Math.max(0, d.origStart + dt))
    newEnd = newStart + dur
  }

  d.barEl.style.left = `${newStart * pxPerSec.value}px`
  d.barEl.style.width = `${(newEnd - newStart) * pxPerSec.value}px`
}

function onTweenDragEnd(e: MouseEvent) {
  const d = tweenDrag.value
  if (d) {
    const dx = e.clientX - d.startX
    const dt = dx / pxPerSec.value

    let newStart = d.origStart
    let newEnd = d.origEnd

    if (d.mode === 'start') {
      newStart = snapTime(Math.max(0, d.origStart + dt))
      if (newStart > newEnd - 0.05) newStart = newEnd - 0.05
    } else if (d.mode === 'end') {
      newEnd = snapTime(Math.max(d.origStart + 0.05, d.origEnd + dt))
    } else {
      const dur = d.origEnd - d.origStart
      newStart = snapTime(Math.max(0, d.origStart + dt))
      newEnd = newStart + dur
    }

    newStart = Math.round(newStart * 100) / 100
    newEnd = Math.round(newEnd * 100) / 100

    updateMotionPathTween(d.layerId, d.tweenIndex, { startTime: newStart, endTime: newEnd })

    if (d.barEl) {
      d.barEl.style.left = ''
      d.barEl.style.width = ''
    }
    justFinishedDrag = true
  }
  tweenDrag.value = null
  window.removeEventListener('mousemove', onTweenDragMove)
  window.removeEventListener('mouseup', onTweenDragEnd)
}

// ── Delete selected keyframe ──────────
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return
  if (e.key === 'Escape' && kfDrag.value) {
    cancelKeyframeDrag()
    return
  }
  if (e.key === 'Escape' && presenceDrag.value) {
    cancelPresence()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (kfDrag.value) cancelKeyframeDrag()
    const s = state.selectedKeyframe
    if (!s) return
    e.preventDefault()
    const layer = activeLayers.value.find(l => l.id === s.layerId)
    if (!layer || !canEditTiming(layer) || !layer.keyframes?.[s.property as KeyframeProperty]) return
    const kfs = [...layer.keyframes[s.property as KeyframeProperty]!]
    if (kfs.length <= 2) return // need at least 2 keyframes to be valid
    kfs.splice(s.index, 1)
    updateLayer(s.layerId, {
      keyframes: { ...layer.keyframes, [s.property]: kfs }
    })
    state.selectedKeyframe = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  cancelKeyframeDrag()
  cancelPresence()
  if (dragClickReset) clearTimeout(dragClickReset)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onPlayheadDrag)
  window.removeEventListener('mouseup', onPlayheadUp)
  window.removeEventListener('mousemove', onPresenceMouseMove)
  window.removeEventListener('mouseup', onPresenceMouseUp)
  window.removeEventListener('mousemove', onKeyframeDragMove)
  window.removeEventListener('mouseup', onKeyframeDragEnd)
  window.removeEventListener('mousemove', onLoopDragMove)
  window.removeEventListener('mouseup', onLoopDragUp)
  window.removeEventListener('mousemove', onTweenDragMove)
  window.removeEventListener('mouseup', onTweenDragEnd)
})
</script>

<template>
  <div aria-label="Animation timeline" class="flex min-h-0 flex-col h-full bg-default select-none" @wheel="onWheelZoom">
    <BannerSlideStrip />
    <!-- Timeline header -->
    <div class="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-default bg-elevated shrink-0">
      <span class="text-sm font-semibold mr-2">Timeline</span>
      <span class="hidden sm:inline text-xs text-muted max-w-64 truncate">{{ layoutName(activeFormat || undefined) }} · {{ activeFormat?.w }} × {{ activeFormat?.h }}</span>
      <UButton
        :aria-label="animationPreview ? 'Stop animation preview' : state.isPlaying ? 'Pause playback' : 'Play playback'"
        :icon="animationPreview ? 'i-lucide-square' : state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        variant="ghost"
        size="xs"
        @click="togglePlay"
      />
      <UButton
        icon="i-lucide-rotate-ccw"
        aria-label="Restart playback"
        variant="ghost"
        size="xs"
        @click="restartTimeline"
      />
      <UButton
        icon="i-lucide-repeat"
        :disabled="!!state.sets[state.activeKey]?.playback"
        :title="state.sets[state.activeKey]?.playback ? 'Loop count is set in Slides' : 'Loop preview'"
        :variant="state.isLooping ? 'soft' : 'ghost'"
        size="xs"
        :color="state.isLooping ? 'primary' : undefined"
        @click="() => { state.isLooping = !state.isLooping }"
      />
      <div class="text-xs font-mono text-(--ui-text-muted) ml-2">
        {{ formatTime(state.currentTime) }} / {{ formatTime(state.duration) }}
      </div>
      <span v-if="state.loopIn != null && state.loopOut != null" class="text-[9px] text-[#4a8fe8] font-mono">
        {{ formatTime(state.loopIn) }}–{{ formatTime(state.loopOut!) }}
      </span>
      <UTooltip text="Center on playhead" :delay-duration="300">
        <UButton
          icon="i-lucide-locate-fixed"
          variant="ghost"
          size="xs"
          aria-label="Center on playhead"
          @click="centerOnPlayhead"
        />
      </UTooltip>

      <UPopover v-model:open="keyframeMenuOpen">
        <UButton
          label="Add keyframe"
          icon="i-lucide-diamond-plus"
          color="neutral"
          variant="outline"
          size="xs"
          :disabled="!selectedTimelineLayer || !canEditTiming(selectedTimelineLayer) || selectedTimelineLayer.type === 'audio'"
        />
        <template #content>
          <div class="@container w-72 space-y-3 p-3">
            <p class="text-sm font-medium">
              Keyframe at {{ state.currentTime.toFixed(2) }}s
            </p>
            <UFormField label="Animated property">
              <USelect v-model="keyframeProperty" :items="KF_PROPERTIES.map(prop => ({ label: prop.label, value: prop.key }))" class="w-full" />
            </UFormField>
            <p class="text-xs text-muted">
              Captures the current value. Double-click a property track to add at another time.
            </p>
            <UButton
              label="Insert keyframe"
              icon="i-lucide-diamond-plus"
              size="sm"
              class="w-full justify-center"
              @click="selectedTimelineLayer && insertKeyframe(selectedTimelineLayer, keyframeProperty, state.currentTime)"
            />
          </div>
        </template>
      </UPopover>
      <span v-if="timingHint" role="status" class="text-xs tabular-nums text-muted">{{ timingHint }}</span>
      <!-- Zoom controls -->
      <div class="ml-auto flex items-center gap-1">
        <UButton
          aria-label="Zoom timeline out"
          icon="i-lucide-minus"
          variant="ghost"
          size="xs"
          :disabled="pxPerSec <= ZOOM_MIN"
          @click="zoomOut"
        />
        <span class="text-[10px] text-(--ui-text-muted) w-8 text-center font-mono">{{ zoomPercent }}%</span>
        <UButton
          aria-label="Zoom timeline in"
          icon="i-lucide-plus"
          variant="ghost"
          size="xs"
          :disabled="pxPerSec >= ZOOM_MAX"
          @click="zoomIn"
        />
      </div>
    </div>

    <!-- Timeline body -->
    <div ref="timelineEl" aria-label="Timeline tracks" class="flex-1 min-h-0 overflow-auto relative">
      <div class="flex min-w-fit" :style="{ width: `${LABEL_W + timelineWidth}px` }">
        <!-- Layer labels column -->
        <div class="sticky left-0 z-30 shrink-0 border-r border-default bg-default" :style="{ width: `${LABEL_W}px` }">
          <!-- Ruler spacer -->
          <div class="sticky top-0 z-40 flex items-center border-b border-default bg-elevated px-3 text-xs font-medium text-muted" :style="{ height: `${RULER_H}px` }">
            Layers
          </div>
          <!-- Layer labels + keyframe sub-labels -->
          <template v-for="(layer, i) in sortedLayers" :key="layer.id">
            <!-- Main layer label -->
            <div
              class="group/label flex items-center gap-1 px-1 border-b border-(--ui-border)/30 cursor-pointer hover:bg-(--ui-bg-accented) transition-colors"
              :class="[
                state.selectedLayerId === layer.id ? 'bg-[#f5dfd9] dark:bg-[#553d38] text-highlighted' : '',
                isMaskedLayer(layer.id) ? 'border-l-2 border-l-[#e84aff]/40' : '',
                isMultiSelected(layer.id) ? 'ring-1 ring-inset ring-(--ui-primary)/50' : ''
              ]"
              :style="{ height: `${laneHeight(layer)}px` }"
              :data-layer-label="layer.id"
              :data-selected="state.selectedLayerId === layer.id"
              @click="onLayerLabelClick($event, layer)"
              @contextmenu.prevent="onLayerContextMenu($event, layer)"
            >
              <!-- Expand chevron -->
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="p-0 w-4 h-4 flex items-center justify-center text-[10px] text-(--ui-text-dimmed) hover:text-(--ui-text) shrink-0 transition-transform"
                :class="state.expandedKeyframeLayers.has(layer.id) ? 'rotate-90' : ''"
                :aria-label="`Keyframe tracks for ${layer.name}`"
                :aria-expanded="state.expandedKeyframeLayers.has(layer.id)"
                @click.stop="toggleKeyframeLanes(layer.id)"
              >
                <UIcon name="i-lucide-chevron-right" class="w-3 h-3" />
              </UButton>
              <UIcon :name="LAYER_ICONS[layer.type]" class="w-3 h-3 shrink-0" :style="{ color: getLayerColor(layer) }" />
              <UIcon v-if="decomposingLayerId === layer.id" name="i-lucide-loader-2" class="w-3 h-3 animate-spin text-(--ui-primary) shrink-0" />
              <span class="min-w-0 flex-1 text-xs truncate text-default" :class="state.selectedLayerId === layer.id ? 'font-semibold' : ''">{{ layer.name }}</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="p-0 w-4 h-4 flex items-center justify-center shrink-0"
                :class="layer.hidden ? 'text-dimmed' : 'text-muted hover:text-highlighted opacity-0 group-hover/label:opacity-100 group-focus-within/label:opacity-100'"
                :aria-label="`${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`"
                @click.stop="updateLayer(layer.id, { hidden: !layer.hidden })"
              >
                <UIcon :name="layer.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="w-3 h-3" />
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="p-0 w-4 h-4 flex items-center justify-center shrink-0"
                :class="layer.locked ? 'text-[#e8884a]' : 'text-dimmed hover:text-highlighted opacity-0 group-hover/label:opacity-100 group-focus-within/label:opacity-100'"
                :aria-label="`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`"
                @click.stop="updateLayer(layer.id, { locked: !layer.locked })"
              >
                <UIcon :name="layer.locked ? 'i-lucide-lock' : 'i-lucide-unlock'" class="w-3 h-3" />
              </UButton>
              <!-- Mask indicator -->
              <UIcon v-if="layer.isMask" name="i-lucide-scan" class="w-3 h-3 text-[#e84aff] shrink-0" />
              <!-- Motion path indicator -->
              <UIcon v-if="layer.motionPath?.length" name="i-lucide-spline" class="w-3 h-3 text-success shrink-0" />
              <!-- Remote lock indicator -->
              <template v-if="remoteLocks.get(layer.id)">
                <UIcon name="i-lucide-lock" class="w-3 h-3 shrink-0" :style="{ color: remoteLocks.get(layer.id)!.color }" />
                <span class="text-[8px] shrink-0 font-medium" :style="{ color: remoteLocks.get(layer.id)!.color }">
                  {{ remoteLocks.get(layer.id)!.userName.split(' ')[0] }}
                </span>
              </template>
              <!-- Keyframe indicator -->
              <span
                v-if="hasKeyframes(layer)"
                class="ml-auto text-[8px] text-(--ui-primary) font-mono shrink-0"
              >KF</span>
            </div>
            <!-- Keyframe property sub-labels (when expanded) -->
            <template v-if="state.expandedKeyframeLayers.has(layer.id)">
              <!-- Path sub-label (when motion path active) -->
              <div
                v-if="layer.motionPath?.length >= 2"
                class="flex items-center gap-1 pl-6 pr-2 border-b border-(--ui-border)/20 text-[9px] text-success"
                :style="{ height: `${KF_TRACK_H}px` }"
              >
                <UIcon name="i-lucide-spline" class="w-3 h-3 shrink-0" />
                <span class="truncate">Path</span>
                <span class="ml-auto text-[8px] font-mono">{{ getMotionPathTweens(layer).length }}tw</span>
              </div>
              <div
                v-for="prop in getVisibleKfProperties(layer)"
                :key="`${layer.id}-${prop.key}`"
                class="flex items-center gap-1 pl-6 pr-2 border-b border-(--ui-border)/20 text-[9px] text-(--ui-text-dimmed)"
                :style="{ height: `${KF_TRACK_H}px` }"
              >
                <span class="truncate">{{ prop.label }}</span>
                <UButton
                  icon="i-lucide-diamond-plus"
                  :aria-label="`Add ${prop.label} keyframe at playhead for ${layer.name}`"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="ml-auto size-4 p-0"
                  :disabled="!canEditTiming(layer) || layer.type === 'audio'"
                  @click.stop="insertKeyframe(layer, prop.key, state.currentTime)"
                />
                <span
                  v-if="layer.keyframes?.[prop.key]?.length"
                  class="ml-auto text-[8px] text-(--ui-text-muted) font-mono"
                >{{ layer.keyframes[prop.key]!.length }}</span>
              </div>
            </template>
          </template>
        </div>

        <!-- Keep the playhead below the pinned labels when scrolling horizontally. -->
        <div class="flex-1 relative isolate">
          <!-- Ruler -->
          <div
            ref="rulerEl"
            aria-label="Time ruler"
            class="sticky top-0 z-20 border-b border-default bg-elevated cursor-pointer"
            :style="{ height: `${RULER_H}px` }"
            @mousedown="onRulerMouseDown"
          >
            <div
              v-for="mark in rulerMarks"
              :key="mark.time"
              class="absolute top-0"
              :style="{ left: `${mark.x}px` }"
            >
              <div
                class="bg-(--ui-border)"
                :style="{
                  width: '1px',
                  height: mark.label ? '12px' : '6px',
                  marginTop: mark.label ? '20px' : '26px'
                }"
              />
              <span
                v-if="mark.label"
                class="absolute top-1 left-1 text-[11px] text-muted whitespace-nowrap"
              >{{ mark.label }}</span>
            </div>
            <div class="absolute top-0 bottom-0 pointer-events-none" :style="{ left: `${playheadX}px` }">
              <div class="h-full w-px bg-inverted" />
              <div class="absolute top-0 -left-1 h-2 w-2 rotate-45 bg-inverted" />
            </div>
            <!-- Loop range overlay -->
            <div
              v-if="state.loopIn != null && state.loopOut != null"
              class="absolute top-0 h-full bg-[#4a8fe8]/20 border-x border-[#4a8fe8]/50 cursor-pointer"
              :style="{
                left: `${state.loopIn * pxPerSec}px`,
                width: `${(state.loopOut! - state.loopIn) * pxPerSec}px`
              }"
              @dblclick.stop="clearLoopRange"
            />
          </div>

          <!-- Crossfade zone indicators (rendered behind lanes) -->
          <div
            v-for="(zone, zi) in crossfadeZones"
            :key="`xfade-${zi}`"
            class="absolute pointer-events-none"
            :style="{
              left: `${zone.start * pxPerSec}px`,
              width: `${(zone.end - zone.start) * pxPerSec}px`,
              top: `${RULER_H}px`,
              bottom: '0',
              background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(232,200,74,0.08) 3px, rgba(232,200,74,0.08) 6px)',
              borderLeft: '1px dashed rgba(232,200,74,0.25)',
              borderRight: '1px dashed rgba(232,200,74,0.25)',
              zIndex: 1
            }"
          />

          <!-- Layer lanes + keyframe tracks -->
          <template v-for="(layer, i) in sortedLayers" :key="layer.id">
            <!-- Main layer lane (presence bar) -->
            <div
              class="relative border-b border-(--ui-border)/30 cursor-pointer"
              :class="state.selectedLayerId === layer.id ? 'bg-[#f5dfd9] dark:bg-[#553d38]' : ''"
              :data-layer-lane="layer.id"
              :data-selected="state.selectedLayerId === layer.id"
              :style="{ height: `${laneHeight(layer)}px`, zIndex: 2 }"
              @click="selectLayer(layer.id); onTrackClick($event)"
              @dblclick="addKeyframeAtClick($event, layer.id, keyframeProperty)"
            >
              <!-- Presence bar group (draggable) -->
              <div
                class="presence-bar-group group/presence absolute top-1"
                :style="{
                  left: `${(layer.startTime || 0) * pxPerSec}px`,
                  width: `${((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec}px`,
                  height: `${laneHeight(layer) - 8}px`
                }"
              >
                <!-- Full presence bar -->
                <div
                  class="absolute inset-0 rounded-lg cursor-grab active:cursor-grabbing"
                  :title="`Drag to move ${layer.name}`"
                  :style="{
                    backgroundColor: getLayerColor(layer),
                    opacity: 0.2
                  }"
                  @mousedown="onPresenceMouseDown($event, layer.id, 'move')"
                  @click.stop="onPresenceBarClick(layer)"
                />
                <BannerVideoFilmstrip
                  v-if="layer.type === 'video' && layer.src"
                  class="absolute inset-0 pointer-events-none"
                  :src="layer.src"
                  :clock="layer"
                  :span="layer.endTime - layer.startTime"
                />
                <!-- Waveform canvas for audio layers -->
                <canvas
                  v-if="layer.type === 'audio' && layer.src"
                  :ref="(el: any) => setWaveformCanvas(layer.id, el as HTMLCanvasElement)"
                  class="absolute inset-0 pointer-events-none rounded-sm"
                  :width="Math.round(((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec)"
                  :height="LANE_H - 8"
                />
                <!-- Timing comes from the actual preset or imported keyframe intervals. -->
                <div
                  v-for="(phase, phaseIndex) in phasesByLayer.get(layer.id) || []"
                  :key="`${phase.start}-${phase.kind}`"
                  class="group/phase absolute top-0 z-10 overflow-visible rounded-lg"
                  :data-animation-phase="phase.kind"
                  :style="{
                    left: `${(phase.start - (layer.startTime ?? 0)) * pxPerSec}px`,
                    width: `${(phase.end - phase.start) * pxPerSec}px`,
                    height: layer.type === 'video' && phase.kind !== 'hold' ? '18px' : '100%',
                    backgroundColor: phase.kind === 'hold' ? 'transparent' : getLayerColor(layer),
                    filter: phase.kind === 'exit' ? 'brightness(0.85)' : undefined
                  }"
                  @click.capture="onPhaseClick"
                  @mousedown="phase.kind === 'hold' || phase.kind === 'audio' ? onPresenceMouseDown($event, layer.id, 'move') : undefined"
                >
                  <UButton
                    v-if="layer.type === 'video' && phase.kind === 'hold'"
                    :aria-label="`Edit video ${layer.name}`"
                    :title="`${layer.name} · Select to trim or replace in the sidebar`"
                    color="neutral"
                    variant="ghost"
                    class="size-full cursor-grab rounded-md p-0 hover:bg-transparent focus-visible:ring-inset"
                    @click.stop="onPresenceBarClick(layer)"
                  />
                  <BannerTimelineAnimationPicker
                    v-else
                    :ref="(el) => { if (phaseIndex === 0) setAnimationPicker(layer.id, el) }"
                    :layer="layer"
                    :phase="phase"
                    :direction="phase.direction"
                    :compact="(phase.end - phase.start) * pxPerSec < 66"
                    @drag-start="phase.kind === 'hold' || phase.kind === 'audio' ? onPresenceMouseDown($event, layer.id, 'move') : startPhaseDrag($event, layer, phase, 'move')"
                  />
                  <template v-if="phase.kind !== 'hold' && phase.kind !== 'audio'">
                    <UButton
                      v-for="edge in (['start', 'end'] as const)"
                      :key="edge"
                      :aria-label="`Resize ${phase.label} ${edge} for ${layer.name}`"
                      :title="`Drag to resize ${edge}; arrow keys adjust by 0.05s`"
                      icon="i-lucide-grip-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="absolute inset-y-0 z-30 w-2.5 p-0 cursor-ew-resize rounded-sm text-white/80 opacity-50 hover:opacity-100 focus:opacity-100"
                      :class="edge === 'start' ? 'left-0' : 'right-0'"
                      :disabled="!canEditTiming(layer)"
                      @mousedown.stop="startPhaseDrag($event, layer, phase, edge)"
                      @click.stop.prevent
                      @keydown="nudgePhase($event, layer, phase, edge)"
                    />
                  </template>
                </div>
                <!-- Left edge handle -->
                <div
                  class="absolute bottom-0 left-0 z-20 w-2 h-1.5 cursor-ew-resize rounded-bl-lg bg-current/30"
                  :title="`Resize layer start for ${layer.name}`"
                  @mousedown="onPresenceMouseDown($event, layer.id, 'start')"
                />
                <!-- Right edge handle -->
                <div
                  class="absolute bottom-0 right-0 z-20 w-2 h-1.5 cursor-ew-resize rounded-br-lg bg-current/30"
                  :title="`Resize layer end for ${layer.name}`"
                  @mousedown="onPresenceMouseDown($event, layer.id, 'end')"
                />
              </div>
            </div>

            <!-- Keyframe property sub-tracks (when expanded) -->
            <template v-if="state.expandedKeyframeLayers.has(layer.id)">
              <!-- Path sub-track (tween bars with draggable edges) -->
              <div
                v-if="layer.motionPath?.length >= 2"
                class="relative border-b border-(--ui-border)/20"
                :style="{ height: `${KF_TRACK_H}px`, zIndex: 2 }"
              >
                <div class="absolute inset-0 bg-[#4af0a2]/5" />
                <!-- Presence range background -->
                <div
                  class="absolute top-0 h-full bg-[#4af0a2]/8 rounded-sm"
                  :style="{
                    left: `${(layer.startTime || 0) * pxPerSec}px`,
                    width: `${((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec}px`
                  }"
                />
                <!-- Tween bars -->
                <div
                  v-for="(tw, ti) in getMotionPathTweens(layer)"
                  :key="`tw-${ti}`"
                  class="tween-bar absolute rounded-sm"
                  :style="{
                    left: `${tw.startTime * pxPerSec}px`,
                    width: `${(tw.endTime - tw.startTime) * pxPerSec}px`,
                    top: '2px',
                    height: `${KF_TRACK_H - 4}px`
                  }"
                >
                  <!-- Tween fill -->
                  <div
                    class="absolute inset-0 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
                    :class="selectedTween?.layerId === layer.id && selectedTween?.tweenIndex === ti
                      ? 'bg-[#4af0a2]/50 ring-1 ring-[#4af0a2]'
                      : 'bg-[#4af0a2]/25 hover:bg-[#4af0a2]/35'"
                    @mousedown="onTweenDragStart($event, layer.id, ti, 'move')"
                    @click.stop="selectedTween = { layerId: layer.id, tweenIndex: ti }; selectLayer(layer.id)"
                  >
                    <!-- Path range label -->
                    <span
                      v-if="(tw.endTime - tw.startTime) * pxPerSec > 40"
                      class="absolute inset-0 flex items-center justify-center text-[7px] font-mono text-success pointer-events-none select-none"
                    >{{ Math.round(tw.pathStart * 100) }}–{{ Math.round(tw.pathEnd * 100) }}%</span>
                  </div>
                  <!-- Left edge handle -->
                  <div
                    class="absolute top-0 left-0 w-[5px] h-full cursor-col-resize hover:bg-[#4af0a2]/40 rounded-l-sm z-10"
                    @mousedown="onTweenDragStart($event, layer.id, ti, 'start')"
                  />
                  <!-- Right edge handle -->
                  <div
                    class="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-[#4af0a2]/40 rounded-r-sm z-10"
                    @mousedown="onTweenDragStart($event, layer.id, ti, 'end')"
                  />
                </div>
                <!-- Keyframe diamonds at tween boundaries (Flash-style) -->
                <div
                  v-for="(t, di) in tweenBoundaryTimes(layer)"
                  :key="`twkf-${di}`"
                  class="absolute w-[8px] h-[8px] rotate-45 bg-[#4af0a2] border border-[#0a0b0e] pointer-events-none"
                  :style="{ left: `${t * pxPerSec - 4}px`, top: `${KF_TRACK_H / 2 - 4}px`, zIndex: 11 }"
                />
                <!-- Add tween button (shown at end of last tween) -->
                <div
                  v-if="getMotionPathTweens(layer).length > 0"
                  class="absolute cursor-pointer group"
                  :style="{
                    left: `${getMotionPathTweens(layer)[getMotionPathTweens(layer).length - 1].endTime * pxPerSec + 2}px`,
                    top: `${KF_TRACK_H / 2 - 5}px`,
                    width: '10px',
                    height: '10px'
                  }"
                  @click.stop="addMotionPathTween(layer.id)"
                >
                  <div class="w-full h-full rounded-full bg-[#4af0a2]/20 border border-[#4af0a2]/40 flex items-center justify-center group-hover:bg-[#4af0a2]/40 transition-colors">
                    <span class="text-[7px] text-success font-bold leading-none">+</span>
                  </div>
                </div>
              </div>
              <div
                v-for="prop in getVisibleKfProperties(layer)"
                :key="`track-${layer.id}-${prop.key}`"
                class="relative border-b border-(--ui-border)/20 cursor-crosshair"
                :aria-label="`${prop.label} keyframe track for ${layer.name}`"
                :style="{ height: `${KF_TRACK_H}px`, zIndex: 2 }"
                @dblclick="addKeyframeAtClick($event, layer.id, prop.key)"
              >
                <!-- Subtle track background -->
                <div class="absolute inset-0 bg-(--ui-bg)/30" />

                <!-- Connection lines between keyframes -->
                <template v-for="(kf, ki) in getLayerKeyframes(layer.id, prop.key)" :key="`line-${ki}`">
                  <div
                    v-if="ki < getLayerKeyframes(layer.id, prop.key).length - 1"
                    class="absolute top-1/2 h-px"
                    :style="{
                      left: `${kf.time * pxPerSec}px`,
                      width: `${(getLayerKeyframes(layer.id, prop.key)[ki + 1].time - kf.time) * pxPerSec}px`,
                      backgroundColor: getLayerColor(layer),
                      opacity: 0.4
                    }"
                  />
                </template>

                <!-- Keyframe diamonds -->
                <UButton
                  v-for="(kf, ki) in getLayerKeyframes(layer.id, prop.key)"
                  :key="`kf-${ki}`"
                  :aria-label="`${prop.label} keyframe at ${kf.time.toFixed(2)}s for ${layer.name}`"
                  color="neutral"
                  variant="ghost"
                  class="absolute min-h-0 p-0 cursor-pointer"
                  :style="{
                    left: `${kf.time * pxPerSec - 5}px`,
                    top: `${KF_TRACK_H / 2 - 5}px`,
                    width: '10px',
                    height: '10px'
                  }"
                  @mousedown="onKeyframeDragStart($event, layer.id, prop.key, ki)"
                  @click="selectKeyframe(layer.id, prop.key, ki, $event)"
                  @dblclick.stop
                  @keydown="nudgeKeyframe($event, layer.id, prop.key, ki)"
                >
                  <!-- Diamond shape -->
                  <div
                    class="w-full h-full rotate-45 border transition-colors"
                    :class="isKeyframeSelected(layer.id, prop.key, ki)
                      ? 'bg-(--ui-primary) border-(--ui-primary) scale-110'
                      : 'bg-(--ui-bg-elevated) border-current hover:bg-(--ui-bg-accented)'"
                    :style="{ color: getLayerColor(layer) }"
                  />
                </UButton>
              </div>
            </template>
          </template>

          <!-- Stretch ratio indicator -->
          <div
            v-if="stretchLabel"
            class="absolute pointer-events-none z-50 px-1.5 py-0.5 rounded bg-[#4a8fe8] text-white text-[9px] font-mono font-bold shadow-lg whitespace-nowrap"
            :style="{
              left: `${stretchLabel.x}px`,
              top: `${RULER_H - 20}px`,
              transform: 'translateX(-50%)'
            }"
          >
            {{ stretchLabel.text }}
          </div>

          <!-- Playhead -->
          <div
            class="absolute top-0 bottom-0 pointer-events-none"
            :style="{ left: `${playheadX}px`, zIndex: 50 }"
          >
            <div class="w-px h-full bg-inverted" />
            <div class="absolute -top-0 -left-[4px] w-[9px] h-3 bg-inverted rounded-b-sm" />
          </div>
        </div>
      </div>
    </div>

    <!-- Layer context menu -->
    <BannerLayerContextMenu
      :layer="contextMenuLayer"
      :x="contextMenuPos.x"
      :y="contextMenuPos.y"
      :is-decomposing="decomposingLayerId === contextMenuLayer?.id"
      :is-ai-editing="isAiEditing"
      :multi-select-count="multiSelectedLayers.length"
      @close="contextMenuLayer = null"
      @decompose="handleContextDecompose"
      @edit-with-ai="handleContextEditWithAi"
      @generate-image="handleContextGenerateImage"
      @merge-layers="handleContextMergeLayers"
      @duplicate="handleContextDuplicate"
      @remove="handleContextRemove"
      @bring-to-front="handleContextBringToFront"
      @send-to-back="handleContextSendToBack"
    />
  </div>
</template>
