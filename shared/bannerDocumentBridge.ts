import type { BannerProject, Layer } from '../app/types/banner-studio'
import { isBannerCopyLayerProtected, isSafeBannerRewrite } from './bannerCopyProtection'

/** Local, version-pinned companion contract. This is not an untrusted upload API. */
export const DOCUMENT_BRIDGE_VERSION = 'photocraft-0.16.0/banner-v1' as const
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type NativeDocument = { layers: NativeLayer[], [key: string]: Json }
export type NativeLayer = { id: number, content: { kind: string, text?: string, [key: string]: Json }, [key: string]: Json }
export interface BridgeMapping { bannerId: number, nativeId: number }
export interface BridgeTextMeasurement { left: number, top: number, right: number, bottom: number }
export type BridgeTextMeasurer = (layer: Layer, text: string) => BridgeTextMeasurement | Promise<BridgeTextMeasurement>
export interface BridgeAssessment { id: number, kind: 'text' | 'image' | 'mask' | 'sidecar', reasons: string[], readOnly: boolean }
export interface BridgeSidecar {
  version: typeof DOCUMENT_BRIDGE_VERSION
  revision: number
  sourceHash: string
  snapshot: BannerProject
  boardKey: string
  size: { width: number, height: number }
  mappings: BridgeMapping[]
  assessment: BridgeAssessment[]
  nativeBaseline: NativeDocument
  /** Compressed raster/mask payload digests, verified by the local archive adapter. */
  nativePayloadHashes?: Record<string, string>
}
export interface BridgePatchPlan {
  version: typeof DOCUMENT_BRIDGE_VERSION
  revision: number
  sourceHash: string
  sidecarHash: string
  returnedHash: string
  changes: Array<{ layerId: number, before: string, after: string }>
  textFit: Array<{ layerId: number, bounds: BridgeTextMeasurement }>
  /** Submit after in ONE existing editor history transaction; before is its inverse. */
  before: BannerProject
  after: BannerProject
}

export function canonicalBridgeJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalBridgeJson).join(',')}]`
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalBridgeJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  throw new Error('Bridge requires finite JSON data')
}

export async function hashBridgeValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBridgeJson(value))
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
}

const commonKeys = ['id', 'type', 'name', 'x', 'y', 'w', 'h', 'zIndex', 'opacity', 'rotation', 'transformOrigin', 'mixBlendMode', 'locked', 'hidden', 'clipToPresence', 'clipToBounds', 'animIn', 'animInDur', 'startTime', 'endTime', 'animOut', 'outDur', 'ease', 'animOutEase', 'delay', 'dur', 'feedBindings', 'keyframes', 'motionPath', 'motionPathTweens', 'motionPathAutoRotate', 'motionPathCurviness', 'platformQr', 'isLogo', 'copyLocked']
// companionEdit stays solely in the Banner sidecar. It is descriptive metadata,
// never a native rendering property, trust signal or authority to accept changes.
const textKeys = ['text', 'textRuns', 'fontSize', 'fontWeight', 'fontFamily', 'lineBoxFontSize', 'textAntialias', 'color', 'textTransform', 'letterSpacing', 'lineHeight', 'textAlign', 'fontStyle', 'textShadow', 'textStroke', 'gradientColors', 'textDepth', 'textTexture', 'visualFilter', 'bgColor', 'effectOrigin', 'letteringRecipe', 'companionEdit']
const imageKeys = ['src', 'srcType', 'fit', 'imageCrop', 'focalX', 'focalY', 'borderRadius']
const maskKeys = ['isMask', 'maskShape', 'maskTargetIds', 'maskInvert', 'fillColor', 'borderRadius']
const present = (value: unknown) => value !== undefined && value !== null && value !== false && value !== ''
const hasControlCharacters = (value: string) => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
// This bounded adapter does not prove fallback-free shaping for other scripts or emoji.
const hasUnsupportedCharacters = (value: string) => [...value].some((char) => {
  const code = char.codePointAt(0)!
  return !(code >= 32 && code <= 255) && ![0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022].includes(code)
})

/** Explicit exclusions, never a best-effort rasterization or font fallback. */
export function assessBridgeLayers(layers: Layer[], availableFaces: Array<{ family: string, weight: number, italic: boolean }>): BridgeAssessment[] {
  const ids = new Set<number>()
  for (const layer of layers) {
    if (!Number.isSafeInteger(layer.id) || ids.has(layer.id)) throw new Error('Duplicate or invalid Banner layer identity')
    ids.add(layer.id)
  }
  const results = layers.map((l): BridgeAssessment => {
    const reasons: string[] = []
    let kind: BridgeAssessment['kind'] = l.isMask ? 'mask' : l.type === 'text' ? 'text' : l.type === 'image' ? 'image' : 'sidecar'
    if (kind === 'sidecar') reasons.push(`Unsupported layer type: ${l.type}`)
    const allowed = new Set([...commonKeys, ...(kind === 'text' ? textKeys : kind === 'image' ? imageKeys : maskKeys)])
    for (const key of Object.keys(l)) if (!allowed.has(key)) reasons.push(`Unsupported property: ${key}`)
    if (![l.x, l.y, l.w, l.h, l.zIndex, l.opacity].every(Number.isFinite) || l.w <= 0 || l.h <= 0 || l.opacity < 0 || l.opacity > 1) reasons.push('Invalid geometry or opacity')
    if (l.rotation || l.transformOrigin || l.clipToBounds || l.clipToPresence) reasons.push('Unsupported transform or clipping')
    if (l.mixBlendMode && l.mixBlendMode !== 'normal') reasons.push('Unsupported blend mode')
    if ((l.animIn && l.animIn !== 'none') || (l.animOut && l.animOut !== 'none') || Object.values(l.keyframes || {}).some(v => v?.length) || l.motionPath?.length || l.motionPathTweens?.length || l.feedBindings?.length) reasons.push('Animation or live binding is not transferable')
    if (l.platformQr || l.isLogo) reasons.push('Protected QR/logo remains in sidecar')
    if (kind === 'text') {
      if (typeof l.text !== 'string' || !l.text.trim() || l.text.length > 4000 || hasControlCharacters(l.text)) reasons.push('Only bounded single-line text is supported')
      if (typeof l.text === 'string' && hasUnsupportedCharacters(l.text)) reasons.push('Unproven glyph coverage or complex script')
      if (!availableFaces.some(f => f.family === l.fontFamily && f.weight === (l.fontWeight ?? 400) && !f.italic)) reasons.push('Exact font face unavailable; substitution forbidden')
      if (!Number.isFinite(l.fontSize) || l.fontSize! <= 0 || l.fontSize! > 1000 || (l.lineHeight !== undefined && (!Number.isFinite(l.lineHeight) || l.lineHeight <= 0))) reasons.push('Unsupported font metrics')
      if ((l.text?.length ?? 0) * l.fontSize! ** 2 > 16_777_216) reasons.push('Text exceeds local measurement resource budget')
      if (!/^#[\da-f]{6}$/i.test(l.color || '')) reasons.push('Only opaque six-digit text colour is supported')
      if ((l.fontStyle && l.fontStyle !== 'normal') || (l.textAlign && l.textAlign !== 'left') || (l.textTransform && l.textTransform !== 'none') || (l.letterSpacing && !['0', '0px', 'normal'].includes(l.letterSpacing))) reasons.push('Unsupported typography')
      if (['textRuns', 'lineBoxFontSize', 'textShadow', 'textStroke', 'gradientColors', 'textDepth', 'textTexture', 'bgColor', 'effectOrigin', 'letteringRecipe'].some(k => present(l[k as keyof Layer])) || (l.visualFilter && l.visualFilter !== 'none') || l.textAntialias === false) reasons.push('Unsupported rich text/effects')
    }
    if (kind === 'image') {
      if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(l.src || '') || l.src!.length > 24_000_000) reasons.push('Only bounded embedded PNG assets; paths and URLs forbidden')
      if (l.fit !== 'fill' || l.imageCrop || l.borderRadius || l.focalX !== undefined || l.focalY !== undefined || l.srcType === 'video') reasons.push('Unsupported image fit/crop')
      if (![l.x, l.y, l.w, l.h].every(Number.isInteger)) reasons.push('Only integer image placement is supported')
    }
    if (kind === 'mask') {
      if (l.type !== 'rect' || (l.maskShape && l.maskShape !== 'rect') || l.borderRadius || l.opacity !== 1 || l.hidden || !l.maskTargetIds?.length || l.maskTargetIds.some(id => !ids.has(id) || id === l.id)) reasons.push('Only independent opaque rectangular masks are supported')
    }
    if (reasons.length) kind = 'sidecar'
    return { id: l.id, kind, reasons, readOnly: !!(l.locked || l.platformQr || l.isLogo || l.isMask || l.type !== 'text' || isBannerCopyLayerProtected(l)) }
  })
  // Never export a target while dropping an unsupported mask, or choose arbitrarily among masks.
  for (const l of layers) {
    const incoming = layers.filter(m => m.isMask && m.maskTargetIds?.includes(l.id))
    const r = results.find(r => r.id === l.id)!
    if (incoming.length && (r.kind !== 'image' || incoming.length !== 1 || results.find(r => r.id === incoming[0]!.id)!.kind !== 'mask')) {
      r.kind = 'sidecar'
      r.reasons.push('Unsupported incoming mask or multiple masks')
    }
  }
  for (const m of layers.filter(l => l.isMask)) {
    const r = results.find(r => r.id === m.id)!
    if (m.maskTargetIds?.some(id => results.find(r => r.id === id)?.kind !== 'image')) {
      r.kind = 'sidecar'
      r.reasons.push('Mask target not representable')
      for (const id of m.maskTargetIds) {
        const target = results.find(r => r.id === id)
        if (target) {
          target.kind = 'sidecar'
          target.reasons.push('Shared mask has an unsupported target')
        }
      }
    }
  }
  return results
}

function assertNative(doc: NativeDocument) {
  if (!doc || !Array.isArray(doc.layers) || doc.layers.length > 500) throw new Error('Invalid native document')
  const ids = new Set<number>()
  for (const l of doc.layers) {
    if (!Number.isSafeInteger(l.id) || ids.has(l.id) || !l.content) throw new Error('Duplicate or invalid native identity')
    ids.add(l.id)
  }
  canonicalBridgeJson(doc)
}

export async function createBridgeSidecar(input: Omit<BridgeSidecar, 'version' | 'sourceHash'>): Promise<{ sidecar: BridgeSidecar, sidecarHash: string }> {
  const sidecar: BridgeSidecar = structuredClone({ ...input, version: DOCUMENT_BRIDGE_VERSION, sourceHash: await hashBridgeValue(input.snapshot) })
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('Invalid revision')
  const layers = input.snapshot.canvasData[input.boardKey]?.layers
  if (!layers || !input.mappings.length || input.mappings.length > 500) throw new Error('Missing bridge board or mapping')
  if (![input.size.width, input.size.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)) throw new Error('Canvas outside bounded bridge limits')
  assertNative(input.nativeBaseline)
  const bannerIds = new Set<number>(), nativeIds = new Set<number>()
  for (const m of input.mappings) {
    const l = layers.find(l => l.id === m.bannerId)
    const native = input.nativeBaseline.layers.find(l => l.id === m.nativeId)
    const assessment = input.assessment.find(a => a.id === m.bannerId)
    if (!l || !native || !assessment || !['text', 'image'].includes(assessment.kind) || bannerIds.has(m.bannerId) || nativeIds.has(m.nativeId)) throw new Error('Invalid bridge mapping')
    if (l.type !== assessment.kind) throw new Error('Mapping kind disagrees with source layer')
    if ((l.type === 'text' && (native.content.kind !== 'text' || native.content.text !== l.text)) || (l.type === 'image' && native.content.kind !== 'raster')) throw new Error('Native content does not match original layer')
    bannerIds.add(m.bannerId)
    nativeIds.add(m.nativeId)
  }
  if (nativeIds.size !== input.nativeBaseline.layers.length) throw new Error('Unmapped native layer')
  return { sidecar, sidecarHash: await hashBridgeValue(sidecar) }
}

/** Normalize ONLY derived text caches and run lengths; no external metadata enters Banner. */
function withoutDerivedText(doc: NativeDocument): NativeDocument {
  const copy = structuredClone(doc)
  // Save-as updates the native filename, which has no Banner meaning.
  delete copy.name
  // PhotoCraft allocates a new document session ID when reopening. Layer IDs remain binding.
  delete copy.id
  for (const layer of copy.layers) {
    const c = layer.content
    if (c.kind !== 'text') continue
    if (typeof c.text !== 'string' || !Array.isArray(c.runs) || c.runs.length !== 1 || !Array.isArray(c.paragraphs) || c.paragraphs.length !== 1) throw new Error('Unsupported native text structure')
    // Native 0.16.0 manifest lengths are UTF-8 bytes, unlike type.info's character offsets.
    const count = new TextEncoder().encode(c.text).length
    for (const item of [...c.runs, ...c.paragraphs]) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || item.len !== count) throw new Error('Invalid native text run coverage')
      item.len = 0
    }
    delete c.text
    delete c.cache
    delete c.psd_raw
  }
  return copy
}

export async function planBridgeReturn(input: {
  sidecar: BridgeSidecar
  /** Retain this digest in the trusted originating session, not in an imported document. */
  expectedSidecarHash: string
  currentProject: BannerProject
  currentRevision: number
  returned: NativeDocument
  /** Trusted renderer callback, never measurements supplied by an external document. */
  measureText?: BridgeTextMeasurer
}): Promise<BridgePatchPlan> {
  // Own immutable JSON snapshots before the first await. Recheck caller inputs
  // synchronously after the final await so a renderer cannot race this boundary.
  const initial = { sidecar: canonicalBridgeJson(input.sidecar), project: canonicalBridgeJson(input.currentProject), returned: canonicalBridgeJson(input.returned), revision: input.currentRevision, expectedHash: input.expectedSidecarHash }
  // Preserve original key order as well as values in the proposed project.
  const s = structuredClone(input.sidecar)
  const currentProject = structuredClone(input.currentProject)
  const returned = structuredClone(input.returned)
  const measureText = input.measureText
  const returnedHash = await hashBridgeValue(returned)
  if (s.version !== DOCUMENT_BRIDGE_VERSION || await hashBridgeValue(s) !== initial.expectedHash) throw new Error('Untrusted or changed bridge sidecar')
  if (initial.revision !== s.revision || await hashBridgeValue(currentProject) !== s.sourceHash || await hashBridgeValue(s.snapshot) !== s.sourceHash) throw new Error('Stale project revision or source hash')
  assertNative(returned)
  if (canonicalBridgeJson(withoutDerivedText(returned)) !== canonicalBridgeJson(withoutDerivedText(s.nativeBaseline))) throw new Error('Unsupported native structure, typography, transform, mask or asset change')
  const before = structuredClone(currentProject), after = structuredClone(currentProject)
  const changes: BridgePatchPlan['changes'] = []
  const textFit: BridgePatchPlan['textFit'] = []
  for (const m of s.mappings) {
    const original = before.canvasData[s.boardKey]!.layers.find(l => l.id === m.bannerId)!
    const native = returned.layers.find(l => l.id === m.nativeId)!
    if (native.content.kind !== 'text' || native.content.text === original.text) continue
    const text = native.content.text!
    if (original.type !== 'text' || original.locked || original.platformQr || original.isLogo || isBannerCopyLayerProtected(original) || s.assessment.find(a => a.id === original.id)?.readOnly) throw new Error('Protected layer edit rejected')
    if (!isSafeBannerRewrite(original.text!, text) || hasControlCharacters(text) || hasUnsupportedCharacters(text)) throw new Error('Unsupported or unsafe replacement text')
    if (!measureText) throw new Error('Trusted text fit measurement required')
    const bounds = await measureText(structuredClone(original), text)
    if (!bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
      || bounds.left < 0 || bounds.top < 0 || bounds.right <= bounds.left || bounds.bottom <= bounds.top
      || bounds.right > original.w || bounds.bottom > original.h) throw new Error('Returned text does not fit unchanged layer bounds')
    textFit.push({ layerId: original.id, bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } })
    after.canvasData[s.boardKey]!.layers.find(l => l.id === m.bannerId)!.text = text
    changes.push({ layerId: m.bannerId, before: original.text!, after: text })
  }
  if (input.currentRevision !== initial.revision || input.expectedSidecarHash !== initial.expectedHash
    || canonicalBridgeJson(input.currentProject) !== initial.project || canonicalBridgeJson(input.returned) !== initial.returned
    || canonicalBridgeJson(input.sidecar) !== initial.sidecar) throw new Error('Bridge inputs changed during text measurement')
  return { version: DOCUMENT_BRIDGE_VERSION, revision: s.revision, sourceHash: s.sourceHash, sidecarHash: initial.expectedHash, returnedHash, changes, textFit, before, after }
}

/** Re-plan at apply time and reject altered/stale previews. Caller owns one undo transaction. */
export async function validateBridgeApply(input: Parameters<typeof planBridgeReturn>[0], reviewedPlan: BridgePatchPlan): Promise<BannerProject> {
  const reviewed = canonicalBridgeJson(reviewedPlan)
  const guard = canonicalBridgeJson({ sidecar: input.sidecar, returned: input.returned, project: input.currentProject, revision: input.currentRevision, expectedHash: input.expectedSidecarHash })
  const fresh = await planBridgeReturn(input)
  if (canonicalBridgeJson(fresh) !== reviewed || canonicalBridgeJson(reviewedPlan) !== reviewed) throw new Error('Bridge preview changed before apply')
  if (canonicalBridgeJson({ sidecar: input.sidecar, returned: input.returned, project: input.currentProject, revision: input.currentRevision, expectedHash: input.expectedSidecarHash }) !== guard) throw new Error('Bridge inputs changed before apply')
  return structuredClone(fresh.after)
}
