<script setup lang="ts">
import { LAYER_COLORS, LAYER_TYPE_COLORS } from '~/utils/banner-constants'
import type { KeyframeProperty, Keyframe, Layer } from '~/types/banner-studio'
import { hasKeyframes } from '~/composables/useBannerTimeline'

const { state, activeLayers, selectLayer, updateLayer, duplicateLayer, removeLayer, bringToFront, sendToBack, getMotionPathTweens, updateMotionPathTween, addMotionPathTween, removeMotionPathTween } = useBannerStudio()
const { remoteLocks } = useBannerRealtime()
const { togglePlay, seekTo, restartTimeline, buildTimeline } = useBannerTimeline()
const { decomposingLayerId, decomposeFromUrl } = useDecompose()
const { isEditing: isAiEditing, openEdit: openAiEdit } = useAiLayerEdit()
const { isMerging, mergeLayers } = useMergeLayers()

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

// ── Multi-select ──
const multiSelectedLayers = ref<number[]>([])

function onLayerLabelClick(e: MouseEvent, layer: Layer) {
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
      if (canvas) drawWaveform(canvas, peaks, 'rgba(232, 200, 74, 0.5)')
    }
  },
  { immediate: true, deep: true },
)

const timelineEl = ref<HTMLElement | null>(null)
const rulerEl = ref<HTMLElement | null>(null)
const isDraggingPlayhead = ref(false)

// Keyframe property labels
const KF_PROPERTIES: { key: KeyframeProperty; label: string; icon: string }[] = [
  { key: 'opacity', label: 'Opacity', icon: 'O' },
  { key: 'x', label: 'X', icon: 'X' },
  { key: 'y', label: 'Y', icon: 'Y' },
  { key: 'scaleX', label: 'Scale X', icon: 'Sx' },
  { key: 'scaleY', label: 'Scale Y', icon: 'Sy' },
  { key: 'rotation', label: 'Rotation', icon: 'R' },
]

/** Get visible KF properties for a layer — hides x/y when motion path is active */
function getVisibleKfProperties(layer: { motionPath?: any[] }) {
  if (layer.motionPath?.length >= 2) {
    return KF_PROPERTIES.filter(p => p.key !== 'x' && p.key !== 'y')
  }
  return KF_PROPERTIES
}

// Layers sorted by zIndex descending for lane display
const sortedLayers = computed(() => {
  return [...activeLayers.value].sort((a, b) => b.zIndex - a.zIndex)
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
const loopDrag = ref<{ startTime: number; active: boolean } | null>(null)

function clearLoopRange() {
  state.loopIn = null
  state.loopOut = null
}

// ── Stretch indicator ────────────────
const stretchLabel = ref<{ x: number; y: number; text: string } | null>(null)

// ── Constants ─────────────────────────
const LANE_H = 28
const KF_TRACK_H = 20
const RULER_H = 24
const LABEL_W = 160

/** Get height for a layer lane (main + expanded keyframe tracks) */
function getLaneHeight(layerId: number): number {
  if (state.expandedKeyframeLayers.has(layerId)) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    const props = layer ? getVisibleKfProperties(layer) : KF_PROPERTIES
    // Add 1 extra track for "Path" sub-track when motion path is active
    const extraTrack = (layer?.motionPath?.length ?? 0) >= 2 ? 1 : 0
    return LANE_H + (props.length + extraTrack) * KF_TRACK_H
  }
  return LANE_H
}

// Total timeline width
const timelineWidth = computed(() => Math.max(600, state.duration * pxPerSec.value + 60))

// Time ruler marks
const rulerMarks = computed(() => {
  const marks: { time: number; x: number; label: string | null }[] = []
  const step = 0.5
  for (let t = 0; t <= state.duration + 0.5; t += step) {
    const rounded = Math.round(t * 10) / 10
    marks.push({
      time: rounded,
      x: rounded * pxPerSec.value,
      label: rounded % 1 === 0 ? `${rounded}s` : null,
    })
  }
  return marks
})

// Playhead position
const playheadX = computed(() => state.currentTime * pxPerSec.value)

function getLayerColor(layer: { type: string }): string {
  return LAYER_TYPE_COLORS[layer.type] || LAYER_COLORS[0]
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
} | null>(null)

let justFinishedDrag = false

function onPresenceMouseDown(e: MouseEvent, layerId: number, mode: 'start' | 'end' | 'move') {
  e.stopPropagation()
  e.preventDefault()
  const layer = activeLayers.value.find(l => l.id === layerId)
  if (!layer) return

  presenceDrag.value = {
    layerId,
    mode,
    origStart: layer.startTime || 0,
    origEnd: layer.endTime || 3,
    startX: e.clientX,
    barEl: (e.currentTarget as HTMLElement).closest('.presence-bar-group') as HTMLElement,
  }

  window.addEventListener('mousemove', onPresenceMouseMove)
  window.addEventListener('mouseup', onPresenceMouseUp)
}

function onPresenceMouseMove(e: MouseEvent) {
  const d = presenceDrag.value
  if (!d) return

  const dx = e.clientX - d.startX
  const dt = dx / pxPerSec.value

  let newStart = d.origStart
  let newEnd = d.origEnd

  if (d.mode === 'start') {
    newStart = snapTime(Math.max(0, d.origStart + dt))
    if (newStart > newEnd - 0.1) newStart = newEnd - 0.1
  } else if (d.mode === 'end') {
    newEnd = snapTime(Math.max(d.origStart + 0.1, d.origEnd + dt))
  } else {
    // move — shift both equally
    const duration = d.origEnd - d.origStart
    newStart = snapTime(Math.max(0, d.origStart + dt))
    newEnd = newStart + duration
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
        text: `\u00d7${ratio.toFixed(1)}`,
      }
    } else {
      stretchLabel.value = null
    }
  }
}

function onPresenceMouseUp(e: MouseEvent) {
  const d = presenceDrag.value
  if (d) {
    const dx = e.clientX - d.startX
    const dt = dx / pxPerSec.value

    let newStart = d.origStart
    let newEnd = d.origEnd

    if (d.mode === 'start') {
      newStart = snapTime(Math.max(0, d.origStart + dt))
      if (newStart > newEnd - 0.1) newStart = newEnd - 0.1
    } else if (d.mode === 'end') {
      newEnd = snapTime(Math.max(d.origStart + 0.1, d.origEnd + dt))
    } else {
      const duration = d.origEnd - d.origStart
      newStart = snapTime(Math.max(0, d.origStart + dt))
      newEnd = newStart + duration
    }

    // Round to 2 decimal places for clean values
    newStart = Math.round(newStart * 100) / 100
    newEnd = Math.round(newEnd * 100) / 100

    updateLayer(d.layerId, { startTime: newStart, endTime: newEnd })

    // Reset direct DOM mutation
    if (d.barEl) {
      d.barEl.style.left = ''
      d.barEl.style.width = ''
    }

    justFinishedDrag = true
  }

  presenceDrag.value = null
  stretchLabel.value = null
  window.removeEventListener('mousemove', onPresenceMouseMove)
  window.removeEventListener('mouseup', onPresenceMouseUp)
}

// ── Crossfade zones ───────────────────
const crossfadeZones = computed(() => {
  const bgs = sortedLayers.value
    .filter(l => l.type === 'bg')
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
  const zones: { start: number; end: number }[] = []
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
  state.selectedKeyframe = { layerId, property: prop, index: idx }
  selectLayer(layerId)
}

function addKeyframeAtClick(e: MouseEvent, layerId: number, prop: KeyframeProperty) {
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const time = Math.round(Math.max(0, x / pxPerSec.value) * 100) / 100

  const layer = activeLayers.value.find(l => l.id === layerId)
  if (!layer) return

  // Get default value for this property
  const defaultValues: Record<KeyframeProperty, number> = {
    opacity: layer.opacity,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: layer.rotation || 0,
  }

  const existing = layer.keyframes?.[prop] || []
  const newKf: Keyframe = { time, value: defaultValues[prop], easing: 'power2.out' }
  const updated = [...existing, newKf].sort((a, b) => a.time - b.time)

  updateLayer(layerId, {
    keyframes: {
      ...(layer.keyframes || {}),
      [prop]: updated,
    },
  })

  // Select the newly added keyframe
  const newIdx = updated.findIndex(kf => kf.time === time)
  state.selectedKeyframe = { layerId, property: prop, index: newIdx }
}

// ── Keyframe drag ─────────────────────
const kfDrag = ref<{
  layerId: number
  prop: KeyframeProperty
  index: number
  origTime: number
  startX: number
  diamondEl: HTMLElement | null
} | null>(null)

function onKeyframeDragStart(e: MouseEvent, layerId: number, prop: KeyframeProperty, idx: number) {
  e.stopPropagation()
  e.preventDefault()
  const kfs = getLayerKeyframes(layerId, prop)
  if (!kfs[idx]) return

  kfDrag.value = {
    layerId,
    prop,
    index: idx,
    origTime: kfs[idx].time,
    startX: e.clientX,
    diamondEl: e.currentTarget as HTMLElement,
  }

  state.selectedKeyframe = { layerId, property: prop, index: idx }
  window.addEventListener('mousemove', onKeyframeDragMove)
  window.addEventListener('mouseup', onKeyframeDragEnd)
}

function onKeyframeDragMove(e: MouseEvent) {
  const d = kfDrag.value
  if (!d || !d.diamondEl) return
  const dx = e.clientX - d.startX
  const dt = dx / pxPerSec.value
  const newTime = snapTime(Math.max(0, d.origTime + dt))
  // Direct DOM move for smooth 60fps
  d.diamondEl.style.left = `${newTime * pxPerSec.value - 5}px`
}

function onKeyframeDragEnd(e: MouseEvent) {
  const d = kfDrag.value
  if (d) {
    const dx = e.clientX - d.startX
    const dt = dx / pxPerSec.value
    const newTime = Math.round(snapTime(Math.max(0, d.origTime + dt)) * 100) / 100

    const layer = activeLayers.value.find(l => l.id === d.layerId)
    if (layer?.keyframes?.[d.prop]) {
      const updated = [...layer.keyframes[d.prop]!]
      if (updated[d.index]) {
        updated[d.index] = { ...updated[d.index], time: newTime }
        updated.sort((a, b) => a.time - b.time)
        updateLayer(d.layerId, {
          keyframes: { ...layer.keyframes, [d.prop]: updated },
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

const selectedTween = ref<{ layerId: number; tweenIndex: number } | null>(null)

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
    barEl: (e.currentTarget as HTMLElement).closest('.tween-bar') as HTMLElement,
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
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const s = state.selectedKeyframe
    if (!s) return
    e.preventDefault()
    const layer = activeLayers.value.find(l => l.id === s.layerId)
    if (!layer?.keyframes?.[s.property as KeyframeProperty]) return
    const kfs = [...layer.keyframes[s.property as KeyframeProperty]!]
    if (kfs.length <= 2) return // need at least 2 keyframes to be valid
    kfs.splice(s.index, 1)
    updateLayer(s.layerId, {
      keyframes: { ...layer.keyframes, [s.property]: kfs },
    })
    state.selectedKeyframe = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
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
  <div class="flex flex-col h-full bg-[#222225] select-none" @wheel="onWheelZoom">
    <!-- Timeline header -->
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-[#3a3a3f] bg-[#2a2a2e] shrink-0">
      <UButton
        :icon="state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        variant="ghost"
        size="xs"
        @click="togglePlay"
      />
      <UButton
        icon="i-lucide-rotate-ccw"
        variant="ghost"
        size="xs"
        @click="restartTimeline"
      />
      <UButton
        icon="i-lucide-repeat"
        :variant="state.isLooping ? 'soft' : 'ghost'"
        size="xs"
        :color="state.isLooping ? 'primary' : undefined"
        @click="state.isLooping = !state.isLooping"
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
          @click="centerOnPlayhead"
        />
      </UTooltip>

      <!-- Zoom controls -->
      <div class="ml-auto flex items-center gap-1">
        <UButton icon="i-lucide-minus" variant="ghost" size="xs" @click="zoomOut" :disabled="pxPerSec <= ZOOM_MIN" />
        <span class="text-[10px] text-(--ui-text-muted) w-8 text-center font-mono">{{ zoomPercent }}%</span>
        <UButton icon="i-lucide-plus" variant="ghost" size="xs" @click="zoomIn" :disabled="pxPerSec >= ZOOM_MAX" />
      </div>
    </div>

    <!-- Timeline body -->
    <div ref="timelineEl" class="flex-1 overflow-auto relative">
      <div class="flex min-w-fit" :style="{ width: `${LABEL_W + timelineWidth}px` }">
        <!-- Layer labels column -->
        <div class="shrink-0 border-r border-(--ui-border)" :style="{ width: `${LABEL_W}px` }">
          <!-- Ruler spacer -->
          <div class="border-b border-(--ui-border)" :style="{ height: `${RULER_H}px` }" />
          <!-- Layer labels + keyframe sub-labels -->
          <template v-for="(layer, i) in sortedLayers" :key="layer.id">
            <!-- Main layer label -->
            <div
              class="flex items-center gap-1 px-1 border-b border-(--ui-border)/30 cursor-pointer hover:bg-(--ui-bg-accented) transition-colors"
              :class="[
                state.selectedLayerId === layer.id ? 'bg-(--ui-bg-accented)' : '',
                isMaskedLayer(layer.id) ? 'border-l-2 border-l-[#e84aff]/40' : '',
                isMultiSelected(layer.id) ? 'ring-1 ring-inset ring-(--ui-primary)/50' : '',
              ]"
              :style="{ height: `${LANE_H}px` }"
              @click="onLayerLabelClick($event, layer)"
              @contextmenu.prevent="onLayerContextMenu($event, layer)"
            >
              <!-- Expand chevron -->
              <button
                class="w-4 h-4 flex items-center justify-center text-[10px] text-(--ui-text-dimmed) hover:text-(--ui-text) shrink-0 transition-transform"
                :class="state.expandedKeyframeLayers.has(layer.id) ? 'rotate-90' : ''"
                @click.stop="toggleKeyframeLanes(layer.id)"
              >
                <UIcon name="i-lucide-chevron-right" class="w-3 h-3" />
              </button>
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: getLayerColor(layer) }"
              />
              <button
                class="w-4 h-4 flex items-center justify-center shrink-0"
                :class="layer.hidden ? 'text-[#555]' : 'text-[#888] hover:text-white'"
                @click.stop="updateLayer(layer.id, { hidden: !layer.hidden })"
              >
                <UIcon :name="layer.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="w-3 h-3" />
              </button>
              <button
                class="w-4 h-4 flex items-center justify-center shrink-0"
                :class="layer.locked ? 'text-[#e8884a]' : 'text-[#555] hover:text-white'"
                @click.stop="updateLayer(layer.id, { locked: !layer.locked })"
              >
                <UIcon :name="layer.locked ? 'i-lucide-lock' : 'i-lucide-unlock'" class="w-3 h-3" />
              </button>
              <UIcon v-if="decomposingLayerId === layer.id" name="i-lucide-loader-2" class="w-3 h-3 animate-spin text-(--ui-primary) shrink-0" />
              <span class="text-[10px] truncate text-(--ui-text-muted)">{{ layer.name }}</span>
              <!-- Mask indicator -->
              <UIcon v-if="layer.isMask" name="i-lucide-scan" class="w-3 h-3 text-[#e84aff] shrink-0" />
              <!-- Motion path indicator -->
              <UIcon v-if="layer.motionPath?.length" name="i-lucide-spline" class="w-3 h-3 text-[#4af0a2] shrink-0" />
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
                class="flex items-center gap-1 pl-6 pr-2 border-b border-(--ui-border)/20 text-[9px] text-[#4af0a2]"
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
                <span class="font-mono w-5 text-right">{{ prop.icon }}</span>
                <span class="truncate">{{ prop.label }}</span>
                <span
                  v-if="layer.keyframes?.[prop.key]?.length"
                  class="ml-auto text-[8px] text-(--ui-text-muted) font-mono"
                >{{ layer.keyframes[prop.key]!.length }}</span>
              </div>
            </template>
          </template>
        </div>

        <!-- Tracks area -->
        <div class="flex-1 relative">
          <!-- Ruler -->
          <div
            ref="rulerEl"
            class="border-b border-(--ui-border) relative cursor-pointer"
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
                  marginTop: mark.label ? '12px' : '18px',
                }"
              />
              <span
                v-if="mark.label"
                class="absolute top-0 left-1 text-[9px] text-(--ui-text-dimmed) whitespace-nowrap"
              >{{ mark.label }}</span>
            </div>
            <!-- Loop range overlay -->
            <div
              v-if="state.loopIn != null && state.loopOut != null"
              class="absolute top-0 h-full bg-[#4a8fe8]/20 border-x border-[#4a8fe8]/50 cursor-pointer"
              :style="{
                left: `${state.loopIn * pxPerSec}px`,
                width: `${(state.loopOut! - state.loopIn) * pxPerSec}px`,
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
              zIndex: 1,
            }"
          />

          <!-- Layer lanes + keyframe tracks -->
          <template v-for="(layer, i) in sortedLayers" :key="layer.id">
            <!-- Main layer lane (presence bar) -->
            <div
              class="relative border-b border-(--ui-border)/30 cursor-pointer"
              :style="{ height: `${LANE_H}px`, zIndex: 2 }"
              @click="onTrackClick"
            >
              <!-- Presence bar group (draggable) -->
              <div
                class="presence-bar-group absolute top-1"
                :style="{
                  left: `${(layer.startTime || 0) * pxPerSec}px`,
                  width: `${((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec}px`,
                  height: `${LANE_H - 8}px`,
                }"
              >
                <!-- Full presence bar -->
                <div
                  class="absolute inset-0 rounded-sm cursor-grab active:cursor-grabbing"
                  :style="{
                    backgroundColor: getLayerColor(layer),
                    opacity: 0.35,
                  }"
                  @mousedown="onPresenceMouseDown($event, layer.id, 'move')"
                />
                <!-- Waveform canvas for audio layers -->
                <canvas
                  v-if="layer.type === 'audio' && layer.src"
                  :ref="(el: any) => setWaveformCanvas(layer.id, el as HTMLCanvasElement)"
                  class="absolute inset-0 pointer-events-none rounded-sm"
                  :width="Math.round(((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec)"
                  :height="LANE_H - 8"
                />
                <!-- Anim-in marker (only for preset-mode layers) -->
                <div
                  v-if="!hasKeyframes(layer) && layer.animIn !== 'none'"
                  class="absolute top-0 left-0 rounded-l-sm pointer-events-none"
                  :style="{
                    width: `${Math.min((layer.animInDur || 0.6) * pxPerSec, ((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec)}px`,
                    height: '100%',
                    backgroundColor: getLayerColor(layer),
                    opacity: 0.7,
                  }"
                />
                <!-- Left edge handle -->
                <div
                  class="absolute top-0 left-0 w-[6px] h-full cursor-col-resize hover:bg-white/20 rounded-l-sm"
                  @mousedown="onPresenceMouseDown($event, layer.id, 'start')"
                />
                <!-- Right edge handle -->
                <div
                  class="absolute top-0 right-0 w-[6px] h-full cursor-col-resize hover:bg-white/20 rounded-r-sm"
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
                    width: `${((layer.endTime || 3) - (layer.startTime || 0)) * pxPerSec}px`,
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
                    height: `${KF_TRACK_H - 4}px`,
                  }"
                >
                  <!-- Tween fill -->
                  <div
                    class="absolute inset-0 rounded-sm cursor-grab active:cursor-grabbing transition-colors"
                    :class="selectedTween?.layerId === layer.id && selectedTween?.tweenIndex === ti
                      ? 'bg-[#4af0a2]/50 ring-1 ring-[#4af0a2]'
                      : 'bg-[#4af0a2]/25 hover:bg-[#4af0a2]/35'"
                    @mousedown="onTweenDragStart($event, layer.id, ti, 'move')"
                    @click.stop="selectedTween = { layerId: layer.id, tweenIndex: ti }; selectLayer(layer.id)"
                  >
                    <!-- Path range label -->
                    <span
                      v-if="(tw.endTime - tw.startTime) * pxPerSec > 40"
                      class="absolute inset-0 flex items-center justify-center text-[7px] font-mono text-[#4af0a2] pointer-events-none select-none"
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
                <!-- Add tween button (shown at end of last tween) -->
                <div
                  v-if="getMotionPathTweens(layer).length > 0"
                  class="absolute cursor-pointer group"
                  :style="{
                    left: `${getMotionPathTweens(layer)[getMotionPathTweens(layer).length - 1].endTime * pxPerSec + 2}px`,
                    top: `${KF_TRACK_H / 2 - 5}px`,
                    width: '10px',
                    height: '10px',
                  }"
                  @click.stop="addMotionPathTween(layer.id)"
                >
                  <div class="w-full h-full rounded-full bg-[#4af0a2]/20 border border-[#4af0a2]/40 flex items-center justify-center group-hover:bg-[#4af0a2]/40 transition-colors">
                    <span class="text-[7px] text-[#4af0a2] font-bold leading-none">+</span>
                  </div>
                </div>
              </div>
              <div
                v-for="prop in getVisibleKfProperties(layer)"
                :key="`track-${layer.id}-${prop.key}`"
                class="relative border-b border-(--ui-border)/20 cursor-crosshair"
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
                      opacity: 0.4,
                    }"
                  />
                </template>

                <!-- Keyframe diamonds -->
                <div
                  v-for="(kf, ki) in getLayerKeyframes(layer.id, prop.key)"
                  :key="`kf-${ki}`"
                  class="absolute cursor-pointer"
                  :style="{
                    left: `${kf.time * pxPerSec - 5}px`,
                    top: `${KF_TRACK_H / 2 - 5}px`,
                    width: '10px',
                    height: '10px',
                  }"
                  @mousedown="onKeyframeDragStart($event, layer.id, prop.key, ki)"
                  @click="selectKeyframe(layer.id, prop.key, ki, $event)"
                >
                  <!-- Diamond shape -->
                  <div
                    class="w-full h-full rotate-45 border transition-colors"
                    :class="isKeyframeSelected(layer.id, prop.key, ki)
                      ? 'bg-(--ui-primary) border-(--ui-primary) scale-110'
                      : 'bg-(--ui-bg-elevated) border-current hover:bg-(--ui-bg-accented)'"
                    :style="{ color: getLayerColor(layer) }"
                  />
                </div>
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
              transform: 'translateX(-50%)',
            }"
          >{{ stretchLabel.text }}</div>

          <!-- Playhead -->
          <div
            class="absolute top-0 bottom-0 pointer-events-none"
            :style="{ left: `${playheadX}px`, zIndex: 50 }"
          >
            <div class="w-px h-full bg-red-500" />
            <div class="absolute -top-0 -left-[4px] w-[9px] h-3 bg-red-500 rounded-b-sm" />
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
      @merge-layers="handleContextMergeLayers"
      @duplicate="handleContextDuplicate"
      @remove="handleContextRemove"
      @bring-to-front="handleContextBringToFront"
      @send-to-back="handleContextSendToBack"
    />
  </div>
</template>
