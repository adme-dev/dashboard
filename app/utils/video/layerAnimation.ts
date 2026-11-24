// Animate layers (2.5D): turn a Separate layers package into one overlay composition.
//
// PURE: no DOM, no fetch. The composition is an ordinary Banner Studio artboard,
// which is the overlay engine Video Studio already previews and renders: each
// layer becomes an image layer at its box, in stacking order, with keyframes.
// Nothing here is a new renderer; it only writes the layer and keyframe data.
import type { Keyframe, KeyframeProperty, Layer } from '~~/app/types/banner-studio'

export interface LayerBox { x: number, y: number, width: number, height: number }
export interface FrameSize { width: number, height: number }
export type LayerFit = 'cover' | 'contain'

export interface LayerPackageLayer {
  derivativeId: string
  r2Key: string
  name: string
  kind: string
  z: number
  /** Where the layer sits in the source picture, in source pixels. */
  bbox: LayerBox
}

export interface LayerPackage {
  /** The layer-package derivative. */
  id: string
  sourceAssetId: string | null
  title: string
  /** Source picture size. Every bbox is in these pixels. */
  width: number
  height: number
  base: { derivativeId: string, r2Key: string } | null
  /** Back to front. */
  layers: LayerPackageLayer[]
  partial: boolean
}

export interface LayerDerivativeInput {
  id: string
  sourceAssetId?: string | null
  kind: string
  r2Key: string
  width?: number | null
  height?: number | null
  metadata?: Record<string, unknown> | null
}

function positive(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function readBox(value: unknown): LayerBox | null {
  if (!value || typeof value !== 'object') return null
  const box = value as Record<string, unknown>
  const x = Number(box.x), y = Number(box.y)
  const width = positive(box.width), height = positive(box.height)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !width || !height) return null
  return { x, y, width, height }
}

function folderOf(r2Key: string): string {
  const cut = r2Key.lastIndexOf('/')
  return cut < 0 ? '' : r2Key.slice(0, cut)
}

/**
 * Group an asset's derivatives into layer packages. One Separate layers run stores
 * its layers, base and manifest in one folder, so the folder is the package.
 * Layers without a readable box are left out rather than guessed.
 */
export function layerPackagesFromDerivatives(derivatives: LayerDerivativeInput[]): LayerPackage[] {
  const packages: LayerPackage[] = []
  for (const manifest of derivatives.filter(d => d.kind === 'layer-package')) {
    const folder = folderOf(manifest.r2Key)
    const siblings = derivatives.filter(d => d.id !== manifest.id && folderOf(d.r2Key) === folder)
    const layers: LayerPackageLayer[] = []
    for (const d of siblings.filter(s => s.kind === 'foreground-png')) {
      const bbox = readBox(d.metadata?.bbox)
      if (!bbox) continue
      const name = typeof d.metadata?.layerName === 'string' && d.metadata.layerName.trim() ? d.metadata.layerName.trim() : 'Layer'
      const kind = typeof d.metadata?.layerKind === 'string' && d.metadata.layerKind.trim() ? d.metadata.layerKind.trim().toLowerCase() : 'graphic'
      const z = Number(d.metadata?.z)
      layers.push({ derivativeId: d.id, r2Key: d.r2Key, name, kind, z: Number.isFinite(z) ? z : layers.length + 1, bbox })
    }
    // Back to front. Ties keep the stored order so a re-run places them the same way.
    layers.sort((a, b) => a.z - b.z)
    const firstLayer = siblings.find(s => s.kind === 'foreground-png')
    const width = positive(manifest.width) ?? positive(firstLayer?.metadata?.sourceWidth)
    const height = positive(manifest.height) ?? positive(firstLayer?.metadata?.sourceHeight)
    if (!width || !height || !layers.length) continue
    const base = siblings.find(s => s.kind === 'background-png')
    packages.push({
      id: manifest.id,
      sourceAssetId: manifest.sourceAssetId ?? null,
      title: typeof manifest.metadata?.title === 'string' ? manifest.metadata.title : `${layers.length} layers`,
      width,
      height,
      base: base ? { derivativeId: base.id, r2Key: base.r2Key } : null,
      layers,
      partial: manifest.metadata?.partial === true
    })
  }
  return packages
}

// ── Source picture → output frame ────────────────────────────────────────────

export interface FrameTransform { scale: number, offsetX: number, offsetY: number }

/** Cover when the shapes are close (a small crop), contain when they are not (nothing important is cut off). */
export function defaultLayerFit(source: FrameSize, frame: FrameSize): LayerFit {
  const drift = Math.abs(Math.log((source.width / source.height) / (frame.width / frame.height)))
  return drift <= 0.2 ? 'cover' : 'contain'
}

export function sourceToFrameTransform(source: FrameSize, frame: FrameSize, fit: LayerFit): FrameTransform {
  const sx = frame.width / source.width, sy = frame.height / source.height
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
  return {
    scale,
    offsetX: (frame.width - source.width * scale) / 2,
    offsetY: (frame.height - source.height * scale) / 2
  }
}

export interface PlacedBox { x: number, y: number, w: number, h: number }

/** A box in source pixels, as whole output-frame pixels. */
export function placeBox(box: LayerBox, t: FrameTransform): PlacedBox {
  const x = Math.round(t.offsetX + box.x * t.scale)
  const y = Math.round(t.offsetY + box.y * t.scale)
  return {
    x,
    y,
    w: Math.max(1, Math.round(t.offsetX + (box.x + box.width) * t.scale) - x),
    h: Math.max(1, Math.round(t.offsetY + (box.y + box.height) * t.scale) - y)
  }
}

// ── Motion presets ───────────────────────────────────────────────────────────

export type LayerMotionPresetId
  = 'hold' | 'bg-zoom' | 'bg-drift' | 'push-in' | 'slide-up' | 'slide-side' | 'fade' | 'pop'

export interface LayerMotionPreset {
  id: LayerMotionPresetId
  label: string
  hint: string
  /** Entrances are staggered one after another; whole-clip moves are not. */
  entrance: boolean
}

export const LAYER_MOTION_PRESETS: LayerMotionPreset[] = [
  { id: 'hold', label: 'Hold still', hint: 'Stays in place for the whole clip.', entrance: false },
  { id: 'bg-zoom', label: 'Slow zoom', hint: 'Background eases closer across the clip.', entrance: false },
  { id: 'bg-drift', label: 'Slow drift', hint: 'Background slides sideways behind the layers for a parallax feel.', entrance: false },
  { id: 'push-in', label: 'Push in', hint: 'Subject grows slightly towards the viewer.', entrance: false },
  { id: 'slide-up', label: 'Slide up', hint: 'Rises into place and fades in.', entrance: true },
  { id: 'slide-side', label: 'Slide in', hint: 'Comes in from the nearest side and fades in.', entrance: true },
  { id: 'fade', label: 'Fade in', hint: 'Fades in where it sits.', entrance: true },
  { id: 'pop', label: 'Pop', hint: 'Scales up with a small overshoot. Good for a price or badge.', entrance: true }
]

const PRESET_BY_ID = new Map(LAYER_MOTION_PRESETS.map(preset => [preset.id, preset]))
const PRESET_BY_LABEL = new Map(LAYER_MOTION_PRESETS.map(preset => [preset.label, preset]))

export function layerMotionPreset(id: string | null | undefined): LayerMotionPreset | null {
  return PRESET_BY_ID.get(id as LayerMotionPresetId) ?? null
}

/** The "auto" choice: pick by what the layer is. */
export function autoMotionPresetFor(kind: string | null | undefined, role: 'base' | 'layer' = 'layer'): LayerMotionPresetId {
  if (role === 'base') return 'bg-zoom'
  const k = (kind ?? '').toLowerCase()
  if (k === 'subject' || k === 'product' || k === 'vehicle') return 'push-in'
  if (k === 'badge' || k === 'button' || k === 'price') return 'pop'
  if (k === 'text') return 'slide-up'
  if (k === 'logo') return 'fade'
  return 'fade'
}

export interface LayerMotionTiming {
  /** Clip length in seconds. */
  durationSec: number
  /** When the first entrance starts. */
  entranceDelaySec: number
  /** Gap between one entrance starting and the next. */
  staggerSec: number
  /** How long one entrance takes. */
  entranceSec: number
}

export const DEFAULT_LAYER_MOTION_TIMING: LayerMotionTiming = {
  durationSec: 6,
  entranceDelaySec: 0.4,
  staggerSec: 0.25,
  entranceSec: 0.6
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Entrance start for the nth staggered layer, kept inside the clip. */
export function entranceStartSec(index: number, timing: LayerMotionTiming): number {
  const latest = Math.max(0, timing.durationSec - timing.entranceSec)
  return round3(Math.min(latest, timing.entranceDelaySec + Math.max(0, index) * timing.staggerSec))
}

export type LayerKeyframes = Partial<Record<KeyframeProperty, Keyframe[]>>

export interface PresetContext {
  placed: PlacedBox
  frame: FrameSize
  timing: LayerMotionTiming
  /** Position among the staggered entrances (0 = first). Ignored by whole-clip moves. */
  entranceIndex: number
}

function visibleThroughout(duration: number): Keyframe[] {
  return [{ time: 0, value: 1, easing: 'none' }, { time: duration, value: 1 }]
}

// Opacity must start at time 0: the overlay builder hides a keyframed layer until
// its first opacity keyframe, so a track that begins later would pop in late.
function fadeTrack(start: number, length: number, duration: number): Keyframe[] {
  const end = round3(Math.min(duration, start + length))
  const frames: Keyframe[] = [{ time: 0, value: 0, easing: 'none' }]
  if (start > 0) frames.push({ time: start, value: 0, easing: 'power2.out' })
  else frames[0]!.easing = 'power2.out'
  frames.push({ time: end, value: 1, easing: 'none' })
  if (end < duration) frames.push({ time: duration, value: 1 })
  return frames
}

function settleTrack(from: number, to: number, start: number, length: number, duration: number, ease: string): Keyframe[] {
  const end = round3(Math.min(duration, start + length))
  const frames: Keyframe[] = [{ time: 0, value: from, easing: start > 0 ? 'none' : ease }]
  if (start > 0) frames.push({ time: start, value: from, easing: ease })
  frames.push({ time: end, value: to, easing: 'none' })
  if (end < duration) frames.push({ time: duration, value: to })
  return frames
}

/**
 * Keyframes for one preset on one layer. x and y are offsets from the layer's
 * resting position, scale is around its centre, and every track spans the clip.
 */
export function presetKeyframes(id: LayerMotionPresetId, ctx: PresetContext): LayerKeyframes {
  const { placed, frame, timing } = ctx
  const duration = timing.durationSec
  const start = entranceStartSec(ctx.entranceIndex, timing)
  const length = timing.entranceSec

  switch (id) {
    case 'bg-zoom':
      return {
        opacity: visibleThroughout(duration),
        scaleX: [{ time: 0, value: 1, easing: 'none' }, { time: duration, value: 1.08 }],
        scaleY: [{ time: 0, value: 1, easing: 'none' }, { time: duration, value: 1.08 }]
      }
    case 'bg-drift': {
      // Oversize first so the drift never shows the edge of the picture.
      const scale = 1.06
      const travel = Math.round(placed.w * (scale - 1) / 2 * 0.8)
      return {
        opacity: visibleThroughout(duration),
        scaleX: [{ time: 0, value: scale, easing: 'none' }, { time: duration, value: scale }],
        scaleY: [{ time: 0, value: scale, easing: 'none' }, { time: duration, value: scale }],
        x: [{ time: 0, value: travel, easing: 'none' }, { time: duration, value: -travel }]
      }
    }
    case 'push-in':
      return {
        opacity: visibleThroughout(duration),
        scaleX: [{ time: 0, value: 1, easing: 'sine.inOut' }, { time: duration, value: 1.06 }],
        scaleY: [{ time: 0, value: 1, easing: 'sine.inOut' }, { time: duration, value: 1.06 }]
      }
    case 'slide-up': {
      const rise = Math.max(24, Math.round(frame.height * 0.04))
      return {
        opacity: fadeTrack(start, length, duration),
        y: settleTrack(rise, 0, start, length, duration, 'power3.out')
      }
    }
    case 'slide-side': {
      const travel = Math.max(32, Math.round(frame.width * 0.08))
      const fromLeft = placed.x + placed.w / 2 <= frame.width / 2
      return {
        opacity: fadeTrack(start, length, duration),
        x: settleTrack(fromLeft ? -travel : travel, 0, start, length, duration, 'power3.out')
      }
    }
    case 'fade':
      return { opacity: fadeTrack(start, length, duration) }
    case 'pop':
      return {
        opacity: fadeTrack(start, Math.min(length, 0.25), duration),
        scaleX: settleTrack(0.6, 1, start, length, duration, 'back.out(2)'),
        scaleY: settleTrack(0.6, 1, start, length, duration, 'back.out(2)')
      }
    case 'hold':
    default:
      return { opacity: visibleThroughout(duration) }
  }
}

// ── The composition ──────────────────────────────────────────────────────────

/** Marks a Banner Studio project as a Video Studio layer composition. */
export const LAYER_COMPOSITION_TAG = 'video-studio:animated-layers'

export function layerCompositionFormatKey(frame: FrameSize): string {
  return `custom_${Math.round(frame.width)}x${Math.round(frame.height)}`
}

export interface CompositionLayerInput {
  /** Durable URL the preview and the renderer can both load. */
  src: string
  name: string
  kind: string
  role: 'base' | 'layer'
  /** Box in source pixels. The base uses the whole picture. */
  bbox: LayerBox
  /** 'auto' picks by kind. */
  preset?: LayerMotionPresetId | 'auto'
}

export interface LayerCompositionInput {
  source: FrameSize
  frame: FrameSize
  fit?: LayerFit
  timing?: Partial<LayerMotionTiming>
  /** Back to front. A base, when present, goes first. */
  layers: CompositionLayerInput[]
}

export interface LayerComposition {
  formatKey: string
  durationSec: number
  canvasData: Record<string, { layers: Layer[], playback: { duration: number, loopCount: number }, bgColor: string }>
}

function withMotion(layer: Layer, id: LayerMotionPresetId, ctx: PresetContext): Layer {
  const preset = layerMotionPreset(id)!
  const start = preset.entrance ? entranceStartSec(ctx.entranceIndex, ctx.timing) : 0
  const end = preset.entrance ? round3(Math.min(ctx.timing.durationSec, start + ctx.timing.entranceSec)) : ctx.timing.durationSec
  return {
    ...layer,
    animIn: 'none',
    animInDur: 0,
    animOut: 'none',
    startTime: 0,
    endTime: ctx.timing.durationSec,
    keyframes: presetKeyframes(id, ctx),
    // The label is how the preset is read back, and what Banner Studio shows on its timeline.
    animationClips: id === 'hold' ? [] : [{ start, end, label: preset.label }]
  }
}

/** Build the artboard: layers at their boxes, back to front, each with its preset's keyframes. */
export function buildLayerComposition(input: LayerCompositionInput): LayerComposition {
  const frame = { width: Math.round(input.frame.width), height: Math.round(input.frame.height) }
  const fit = input.fit ?? defaultLayerFit(input.source, frame)
  const timing = { ...DEFAULT_LAYER_MOTION_TIMING, ...input.timing }
  const transform = sourceToFrameTransform(input.source, frame, fit)
  let entranceIndex = 0
  const layers = input.layers.map((entry, index): Layer => {
    const placed = placeBox(entry.bbox, transform)
    const presetId = !entry.preset || entry.preset === 'auto' ? autoMotionPresetFor(entry.kind, entry.role) : entry.preset
    const preset = layerMotionPreset(presetId) ?? layerMotionPreset('hold')!
    const ctx: PresetContext = { placed, frame, timing, entranceIndex: preset.entrance ? entranceIndex++ : 0 }
    const still: Layer = {
      id: index + 1,
      type: 'image',
      name: entry.role === 'base' ? 'Background' : entry.name,
      x: placed.x,
      y: placed.y,
      w: placed.w,
      h: placed.h,
      // Stacking order is the array order: the base is lowest, the last layer is on top.
      zIndex: index + 1,
      opacity: 1,
      src: entry.src,
      srcType: 'image',
      // The cut-out already has the box's shape; never crop it.
      fit: 'fill',
      animIn: 'none',
      animInDur: 0,
      startTime: 0,
      endTime: timing.durationSec
    }
    return withMotion(still, preset.id, ctx)
  })
  const formatKey = layerCompositionFormatKey(frame)
  return {
    formatKey,
    durationSec: timing.durationSec,
    canvasData: { [formatKey]: { layers, playback: { duration: timing.durationSec, loopCount: 1 }, bgColor: '#000000' } }
  }
}

/** Which preset a layer currently carries, read from its motion label. Null once it has been hand-edited. */
export function layerMotionPresetOf(layer: Pick<Layer, 'animationClips' | 'keyframes'>): LayerMotionPresetId | null {
  const label = layer.animationClips?.[0]?.label
  if (label) return PRESET_BY_LABEL.get(label)?.id ?? null
  const tracks = Object.keys(layer.keyframes ?? {})
  return tracks.length === 0 || (tracks.length === 1 && tracks[0] === 'opacity') ? 'hold' : null
}

function durationOf(layers: Layer[], playback?: { duration?: number } | null): number {
  const fromPlayback = positive(playback?.duration)
  return fromPlayback ?? Math.max(1, ...layers.map(layer => Number(layer.endTime) || 0))
}

/**
 * Re-apply one preset to one layer of an existing composition, leaving the other
 * layers exactly as they are (including anything changed by hand in Banner Studio).
 * An entrance keeps the layer's place in the stagger order.
 */
export function applyLayerMotionPreset(
  layers: Layer[],
  layerId: number,
  presetId: LayerMotionPresetId,
  frame: FrameSize,
  options: { playback?: { duration?: number } | null, timing?: Partial<LayerMotionTiming> } = {}
): Layer[] {
  const preset = layerMotionPreset(presetId)
  if (!preset) return layers
  const timing = { ...DEFAULT_LAYER_MOTION_TIMING, ...options.timing, durationSec: durationOf(layers, options.playback) }
  const ordered = [...layers].filter(layer => layer.type !== 'audio').sort((a, b) => a.zIndex - b.zIndex)
  let entranceIndex = 0
  for (const layer of ordered) {
    if (layer.id === layerId) break
    const current = layerMotionPreset(layerMotionPresetOf(layer))
    if (current?.entrance) entranceIndex++
  }
  return layers.map((layer) => {
    if (layer.id !== layerId) return layer
    const placed = { x: layer.x, y: layer.y, w: layer.w, h: layer.h }
    return withMotion(layer, preset.id, { placed, frame, timing, entranceIndex })
  })
}

// ── Generated motion on one layer ────────────────────────────────────────────

export const LAYER_MOTION_MODEL_ID = 'aigateway/seedance-i2v'
export const LAYER_MOTION_ASPECTS = ['16:9', '9:16', '1:1'] as const
export type LayerMotionAspect = typeof LAYER_MOTION_ASPECTS[number]

const ASPECT_RATIO: Record<LayerMotionAspect, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 }

export interface LayerMotionRegion extends PlacedBox { aspectRatio: LayerMotionAspect }

/**
 * The patch of the frame a generated clip covers: the smallest box of a supported
 * shape that holds the layer plus a little surround, kept inside the frame. The
 * clip is made from this patch and put back on exactly the same pixels.
 */
export function layerMotionRegion(placed: PlacedBox, frame: FrameSize, padding = 0.06): LayerMotionRegion {
  const wantW = placed.w * (1 + padding * 2), wantH = placed.h * (1 + padding * 2)
  const cx = placed.x + placed.w / 2, cy = placed.y + placed.h / 2
  let best: (LayerMotionRegion & { area: number, clipped: boolean }) | null = null
  for (const aspectRatio of LAYER_MOTION_ASPECTS) {
    const ratio = ASPECT_RATIO[aspectRatio]
    let w = Math.max(wantW, wantH * ratio)
    let h = w / ratio
    const shrink = Math.min(1, frame.width / w, frame.height / h)
    w *= shrink
    h *= shrink
    const clipped = shrink < 1 && (w < placed.w || h < placed.h)
    const x = Math.min(Math.max(0, cx - w / 2), frame.width - w)
    const y = Math.min(Math.max(0, cy - h / 2), frame.height - h)
    const candidate = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), aspectRatio, area: w * h, clipped }
    // Prefer a shape that holds the whole layer; among those, the tightest one.
    if (!best || (best.clipped && !candidate.clipped) || (best.clipped === candidate.clipped && candidate.area < best.area)) best = candidate
  }
  const { area: _area, clipped: _clipped, ...region } = best!
  return region
}

/** Published per-second price, in cents, times the clip length. */
export function layerMotionCostCents(durationSeconds: number, centsPerSecond: number): number {
  return Math.round(Math.max(0, durationSeconds) * Math.max(0, centsPerSecond))
}

export function layerMotionPrompt(layerName: string): string {
  const subject = layerName.trim() || 'the subject'
  return `Subtle, realistic motion for ${subject}. Locked-off camera, no zoom, no pan. The background and framing stay exactly as they are. No new objects, no text, no logos.`
}

/**
 * Swap one layer for its generated clip. The clip sits on the region it was made
 * from, in the layer's place in the stack, and plays for the whole composition.
 * Saving the project snapshots the previous version, which is how this is undone.
 */
export function applyGeneratedLayerMotion(
  layers: Layer[],
  layerId: number,
  clip: { src: string, region: PlacedBox, durationSeconds: number },
  options: { playback?: { duration?: number } | null } = {}
): Layer[] {
  const duration = durationOf(layers, options.playback)
  return layers.map((layer) => {
    if (layer.id !== layerId) return layer
    const { imageCrop: _crop, ...rest } = layer
    return {
      ...rest,
      type: 'video',
      srcType: 'video',
      src: clip.src,
      x: clip.region.x,
      y: clip.region.y,
      w: clip.region.w,
      h: clip.region.h,
      fit: 'fill',
      muted: true,
      mediaStart: 0,
      mediaEnd: clip.durationSeconds,
      // A clip shorter than the composition loops rather than freezing on its last frame.
      mediaLoop: clip.durationSeconds < duration,
      startTime: 0,
      endTime: duration,
      keyframes: { opacity: visibleThroughout(duration) },
      animationClips: [{ start: 0, end: Math.min(duration, clip.durationSeconds), label: GENERATED_MOTION_LABEL }]
    } as Layer
  })
}

export const GENERATED_MOTION_LABEL = 'Generated motion'

export function hasGeneratedLayerMotion(layer: Pick<Layer, 'type' | 'animationClips'>): boolean {
  return layer.type === 'video' && layer.animationClips?.[0]?.label === GENERATED_MOTION_LABEL
}
