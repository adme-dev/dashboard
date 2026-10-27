import { bannerPlatformQrSchema } from './bannerQr'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}
function layers(board: unknown): RecordValue[] {
  const value = record(board).layers
  return Array.isArray(value) ? value.map(record) : []
}
const movable = new Set(['x', 'y', 'w', 'h', 'name', 'zIndex', 'hidden', 'locked'])
function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable))
  if (value && typeof value === 'object') return JSON.stringify(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
  return JSON.stringify(value) ?? 'undefined'
}
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

/** Validate the rendering constraints, independently of server-owned provenance. */
export function assertManagedQrCanvas(canvas: unknown): void {
  for (const board of Object.values(record(canvas))) {
    const boardLayers = layers(board)
    for (const layer of boardLayers.filter(item => item.platformQr != null)) {
      bannerPlatformQrSchema.parse(layer.platformQr)
      const bad = !Number.isSafeInteger(layer.id) || Number(layer.id) < 0
        || boardLayers.filter(item => item.id === layer.id).length !== 1
        || layer.type !== 'image' || typeof layer.src !== 'string'
        || layer.fit !== 'contain' || layer.opacity !== 1
        || !finite(layer.w) || Number(layer.w) <= 0
        || !finite(layer.h) || Number(layer.h) <= 0
        || !finite(layer.x) || !finite(layer.y)
        || !!layer.imageCrop || !!layer.isMask || !!layer.isLogo
        || !!layer.rotation || !!layer.borderRadius || !!layer.borderWidth
        || (layer.visualFilter != null && layer.visualFilter !== 'none')
        || (layer.mixBlendMode != null && layer.mixBlendMode !== 'normal')
        || (layer.animIn != null && layer.animIn !== 'none')
        || (layer.animOut != null && layer.animOut !== 'none')
        || (layer.keyframes != null && (typeof layer.keyframes !== 'object' || Array.isArray(layer.keyframes) || Object.values(record(layer.keyframes)).some(value => !Array.isArray(value) || value.length)))
        || ['maskTargetIds', 'feedBindings', 'motionPath', 'motionPathTweens'].some(key => layer[key] != null && (!Array.isArray(layer[key]) || layer[key].length))
        || boardLayers.some(mask => mask.isMask && Array.isArray(mask.maskTargetIds) && mask.maskTargetIds.includes(layer.id))
      if (bad) throw new Error('Managed QR artwork must retain its uncropped, opaque, unfiltered image and quiet zone')
    }
  }
}

/** Existing QR identity cannot be stripped or redrawn by a canvas replacement. */
export function assertManagedQrTransition(before: unknown, after: unknown, options: { allowRemoval?: boolean } = {}): void {
  assertManagedQrCanvas(after)
  for (const [key, board] of Object.entries(record(before))) {
    for (const source of layers(board).filter(layer => layer.platformQr != null)) {
      const target = layers(record(after)[key]).find(layer => layer.id === source.id)
      if (!target && options.allowRemoval) continue
      if (!target) throw new Error('Remove a managed QR code explicitly; AI cannot remove it')
      const protectedValues = (layer: RecordValue) => Object.fromEntries(Object.entries(layer).filter(([name]) => !movable.has(name)))
      if (stable(protectedValues(source)) !== stable(protectedValues(target))) throw new Error('Managed QR identity and pixels cannot change; insert another managed code instead')
    }
  }
}
