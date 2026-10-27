import { z } from 'zod'
import type { ArtboardState, Layer } from '../app/types/banner-studio'
import { resolveBannerFormat } from './bannerFormats'
import { isBannerCopyLayerProtected } from './bannerCopyProtection'

type Canvas = Record<string, ArtboardState>
const coordinate = z.number().finite().min(0).max(20000)
export const bannerDesignScopeSchema = z.object({
  formatKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  layerIds: z.array(z.number().int().nonnegative()).min(1).max(200).refine(ids => new Set(ids).size === ids.length),
  region: z.object({ x: coordinate, y: coordinate, w: coordinate.positive(), h: coordinate.positive() }).strict(),
  approvedCopy: z.array(z.string().trim().min(1).max(4000)).max(30).default([])
}).strict()
export type BannerDesignScope = z.infer<typeof bannerDesignScopeSchema>
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const contains = (a: BannerDesignScope['region'], b: Pick<Layer, 'x' | 'y' | 'w' | 'h'>) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
// Rotated protected geometry uses its conservative axis-aligned enclosure.
function bounds(layer: Layer) {
  const angle = (layer.rotation || 0) * Math.PI / 180
  const w = Math.abs(layer.w * Math.cos(angle)) + Math.abs(layer.h * Math.sin(angle))
  const h = Math.abs(layer.w * Math.sin(angle)) + Math.abs(layer.h * Math.cos(angle))
  return { x: layer.x + (layer.w - w) / 2, y: layer.y + (layer.h - h) / 2, w, h }
}
const overlaps = (a: Pick<Layer, 'x' | 'y' | 'w' | 'h'>, b: Pick<Layer, 'x' | 'y' | 'w' | 'h'>) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function bodyLayoutOnly(layer: Layer, board: ArtboardState): boolean {
  const role = board.reconstruction?.elements.find(item => item.layerId === layer.id)?.role
  return ['letterLocation', 'letterShowroom', 'letterLaunch', 'letterOffer'].includes(role || '')
    && layer.type === 'text' && !layer.locked && !layer.isLogo && !layer.platformQr && !layer.feedBindings?.length
}
export function isDesignScopeProtected(layer: Layer, board: ArtboardState): boolean {
  const role = board.reconstruction?.elements.find(item => item.layerId === layer.id)?.role || ''
  return !!layer.platformQr || !!layer.locked || !!layer.isLogo || (isBannerCopyLayerProtected(layer) && !bodyLayoutOnly(layer, board))
    || /(?:map|road|marker|north|logo|oem|voucher|legal|terms|salutation|greeting|signoff|signatory|luke)/i.test(`${role} ${layer.name}`)
    || /^(?:Dear\b|Sincerely\b|Luke\b)/i.test(layer.text || '')
}
function cleanPlateId(board: ArtboardState): number | undefined {
  const r = board.reconstruction
  if (!r || !r.background.reviewed || r.background.status !== 'clean' || r.background.sha256 === r.source.sha256) return
  return r.elements.find(item => item.role === 'background')?.layerId
}
function staticLayer(layer: Layer, source = false) {
  if (layer.clipToPresence || layer.rotation || layer.transformOrigin || layer.opacity !== 1 || layer.hidden || layer.isMask || layer.maskTargetIds?.length
    || layer.animIn !== 'none' || (layer.animOut && layer.animOut !== 'none' && !(source && layer.animOut === 'fadeOut')) || layer.motionPath?.length || layer.motionPathTweens?.length
    || Object.values(layer.keyframes || {}).some(frames => frames.length) || layer.textShadow || layer.textStroke || layer.textDepth || layer.textTexture
    || (layer.visualFilter && layer.visualFilter !== 'none') || (layer.mixBlendMode && layer.mixBlendMode !== 'normal')) {
    throw new Error('Scoped proposals require static layers without escaping effects')
  }
}

export function validateDesignScope(canvas: Canvas, input: BannerDesignScope): BannerDesignScope {
  const scope = bannerDesignScopeSchema.parse(input)
  const board = canvas[scope.formatKey]
  if (!board) throw new Error('Scoped format is missing')
  const plateId = cleanPlateId(board)
  const size = resolveBannerFormat(scope.formatKey)
  if (!size) throw new Error('Scoped format is unsupported')
  // A full-frame raster cannot establish clean pixels by naming it a background.
  const fullFrame = board.layers.find(layer => (layer.type === 'image' || layer.type === 'bg') && layer.src
    && layer.id !== plateId && layer.x <= size.w * 0.05 && layer.y <= size.h * 0.05 && layer.w >= size.w * 0.95 && layer.h >= size.h * 0.95)
  if (fullFrame && fullFrame.id !== plateId) throw new Error('Flattened artwork needs reviewed extraction and clean-background repair before scoped editing')
  if (size && !contains({ x: 0, y: 0, ...size }, scope.region)) throw new Error('Scoped region is outside the format')
  for (const id of scope.layerIds) {
    const layer = board.layers.find(item => item.id === id)
    if (!layer) throw new Error('Selected layer is missing')
    if (id === plateId || isDesignScopeProtected(layer, board)) throw new Error(`Protected layer cannot be selected: ${layer.name}`)
    if (board.layers.some(mask => mask.isMask && mask.maskTargetIds?.includes(id))) throw new Error('Selected layer has an incoming mask')
    staticLayer(layer, true)
    if (!contains(scope.region, layer)) throw new Error('Selected layer is outside the approved region')
  }
  const originalText = board.layers.map(layer => layer.text || '').join('\n')
  for (const copy of scope.approvedCopy) {
    if (/\bfree\b/i.test(copy) && !/\bfree\b/i.test(originalText)) throw new Error('Do not invent a free claim')
    const times = copy.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi) || []
    if (times.some(time => !originalText.includes(time))) throw new Error('Do not invent an event time')
  }
  return scope
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableValue))
  if (value && typeof value === 'object') return JSON.stringify(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  return JSON.stringify(value) ?? 'undefined'
}
function editorTimingDefaults(layer: Layer) {
  const startTime = layer.startTime ?? layer.delay ?? 0
  const animInDur = layer.animInDur ?? layer.dur ?? 0.6
  return { ...layer, startTime, animInDur, endTime: layer.endTime ?? startTime + (animInDur || 0.6) + 2.5,
    delay: startTime, dur: animInDur, animIn: layer.animIn || 'none', animOut: layer.animOut || 'fadeOut', animOutEase: layer.animOutEase || 'power1.in' }
}
/** A caller cannot relabel saved commercial/map/QR content to make it editable. */
export function assertScopedDesignSource(saved: Canvas, source: Canvas, scope: BannerDesignScope) {
  const savedBoard = saved?.[scope.formatKey], sourceBoard = source[scope.formatKey]
  if (!savedBoard || !sourceBoard) throw new Error('Save the native source before scoped editing')
  const normalize = (canvas: Canvas) => Object.fromEntries(Object.entries(canvas).map(([key, board]) => [key, { ...board, layers: board.layers.map(editorTimingDefaults) }]))
  if (stableValue(normalize(saved)) !== stableValue(normalize(source))) throw new Error('Canvas must match the complete saved source; save/reload before requesting a proposal')
  for (const id of scope.layerIds) {
    const layer = savedBoard.layers.find(item => item.id === id)
    if (!layer || isDesignScopeProtected(layer, savedBoard)) throw new Error('Saved protected layer cannot be selected')
  }
}

/** Enforced on the server and again immediately before applying a preview. */
export function assertScopedDesignTransition(original: Canvas, candidate: Canvas, input: BannerDesignScope) {
  const scope = validateDesignScope(original, input)
  if (!same(Object.keys(original), Object.keys(candidate))) throw new Error('Scoped proposals cannot change formats')
  for (const key of Object.keys(original)) {
    if (key !== scope.formatKey && !same(original[key], candidate[key])) throw new Error('Other formats are protected')
  }
  const before = original[scope.formatKey]!, after = candidate[scope.formatKey]!
  const { layers: oldLayers, ...oldMeta } = before
  const { layers: newLayers, ...newMeta } = after
  if (!same(oldMeta, newMeta)) throw new Error('Artboard metadata is protected')
  if (new Set(newLayers.map(layer => layer.id)).size !== newLayers.length) throw new Error('Layer identities must remain unique')
  const selected = new Set(scope.layerIds), oldIds = new Set(oldLayers.map(layer => layer.id))
  const protectedLayers = oldLayers.filter(layer => !selected.has(layer.id))
  if (!same(newLayers.filter(layer => oldIds.has(layer.id)).map(layer => layer.id), oldLayers.map(layer => layer.id))) throw new Error('Existing layer order and identities are protected')
  for (const layer of protectedLayers) {
    if (!same(layer, newLayers.find(item => item.id === layer.id))) throw new Error(`Protected layer changed: ${layer.name}`)
  }
  const plateId = cleanPlateId(before)
  const affectedLayerIds: number[] = []
  for (const layer of newLayers) {
    const prior = oldLayers.find(item => item.id === layer.id)
    if (prior && same(prior, layer)) continue
    if (prior && !selected.has(layer.id)) throw new Error('Unselected layer is protected')
    staticLayer(layer)
    if (layer.clipToBounds !== true) throw new Error('Scoped layers require clipping to their checked geometry')
    if (!contains(scope.region, layer)) throw new Error('Proposed layer leaves the approved region')
    if (!['text', 'rect', 'image'].includes(layer.type)) throw new Error('Scoped proposals require native static text, shapes or owned images')
    if (prior?.type === 'text' && layer.type !== 'text') throw new Error('Native text cannot be replaced by another layer type')
    if (layer.type === 'text' && (!layer.text?.trim() || layer.h < (layer.fontSize || 16) * (layer.lineHeight || 1.2))) throw new Error('Native wording must remain visible within its text box')
    if (layer.text !== prior?.text && layer.type === 'text' && !scope.approvedCopy.includes(layer.text!)) throw new Error('Changed wording must exactly match human-approved copy')
    const layoutOnly = prior && bodyLayoutOnly(prior, before)
    if (layoutOnly) {
      const withoutLayout = (item: Layer) => Object.fromEntries(Object.entries(item).filter(([key]) => !['x', 'y', 'w', 'h', 'fontSize', 'lineHeight', 'clipToBounds', 'animOut'].includes(key)))
      if (stableValue(withoutLayout(prior)) !== stableValue(withoutLayout(layer))) throw new Error('Letter body permits layout changes only; exact copy and styling are protected')
    }
    if (layer.isLogo || layer.platformQr || (layer.copyLocked && !layoutOnly) || layer.feedBindings?.length) throw new Error('Scoped proposals cannot introduce protected identities')
    for (const protectedLayer of protectedLayers) {
      if (protectedLayer.id === plateId || (protectedLayer.type === 'bg' && !protectedLayer.src)) continue
      // Recoloring/moving existing selected layers must not obscure protected art.
      if (overlaps(layer, bounds(protectedLayer))) throw new Error(`Proposed layer overlaps protected artwork: ${protectedLayer.name}`)
    }
    affectedLayerIds.push(layer.id)
  }
  // Text must remain visible even when the covering layer is also selected/new.
  for (const text of newLayers.filter(layer => layer.type === 'text' && (selected.has(layer.id) || !oldIds.has(layer.id)))) {
    const textOrder = newLayers.indexOf(text)
    for (const covering of newLayers) {
      if (covering.id === text.id || covering.hidden || covering.opacity === 0 || covering.isMask) continue
      const above = covering.zIndex > text.zIndex || (covering.zIndex === text.zIndex && newLayers.indexOf(covering) > textOrder)
      if (above && overlaps(text, bounds(covering))) throw new Error(`Proposed artwork obscures native wording: ${text.name}`)
    }
  }
  return { affectedLayerIds, protectedLayerIds: protectedLayers.map(layer => layer.id) }
}
