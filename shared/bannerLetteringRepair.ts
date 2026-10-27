import { z } from 'zod'
import type { ArtworkAsset, ArtworkEvidence } from './bannerArtwork'
import { isBannerCopyLayerProtected, isProtectedBannerCopy } from './bannerCopyProtection'

/** Coordinates are fractions of the full owned source image, not the artboard. */
export const letteringRepairRegionSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  w: z.number().finite().gt(0).max(1),
  h: z.number().finite().gt(0).max(1)
}).strict().refine(r => r.x + r.w <= 1 && r.y + r.h <= 1, 'Region must remain inside the source image')

const wording = z.string().min(1).max(2000).refine(value => !!value.trim(), 'Wording cannot be blank')
export const letteringRepairRequestSchema = z.object({
  projectId: z.string().uuid(),
  sourceRevision: z.string().datetime({ offset: true }),
  formatKey: z.string().min(1).max(100),
  layerId: z.number().int().positive(),
  region: letteringRepairRegionSchema,
  sourceWording: wording,
  wording,
  regionReviewed: z.literal(true),
  instruction: z.string().trim().max(2000).default('Reconstruct the background beneath the selected lettering.'),
  referenceAssetId: z.string().uuid().optional(),
  sourceImageHash: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict()

export type LetteringRepairRegion = z.infer<typeof letteringRepairRegionSchema>
export type LetteringRepairRequest = z.infer<typeof letteringRepairRequestSchema>
export interface LetteringRepairProposal {
  proposalId: string
  projectId: string
  sourceRevision: string
  formatKey: string
  layerId: number
  region: LetteringRepairRegion
  /** Inward-rounded source pixel bounds: only these pixels may differ. */
  pixelRegion: { x: number, y: number, w: number, h: number }
  sourceWording: string
  wording: string
  sourceAssetId: string
  sourceImageHash: string
  backgroundAsset: ArtworkAsset
  evidence: ArtworkEvidence
  warnings: string[]
  verification: 'review-required'
}

/** Historical repair provenance, not a reusable isolated-lettering recipe or approval attestation.
 * One fixed-shape record per layer; no provider payloads or recursive repair history. */
export interface LetteringRepairMetadata extends Pick<LetteringRepairProposal,
  'proposalId' | 'projectId' | 'sourceRevision' | 'formatKey' | 'layerId'
  | 'region' | 'pixelRegion' | 'sourceWording' | 'wording' | 'sourceAssetId'
  | 'sourceImageHash' | 'backgroundAsset' | 'evidence' | 'verification'> {
  version: 1
  sourceUrl: string
  backgroundLayerId: number
  textLayerId: number
}

type RepairLayer = Record<string, unknown>
const populated = (value: unknown) => value != null && (!Array.isArray(value) || value.length > 0)
function protectedCopy(layer: RepairLayer) {
  const recipe = layer.letteringRecipe as { wording?: unknown } | undefined
  return isBannerCopyLayerProtected(layer) || (typeof recipe?.wording === 'string' && isProtectedBannerCopy(recipe.wording))
}
function animated(layer: RepairLayer) {
  return (layer.animIn != null && layer.animIn !== 'none')
    || (layer.animOut != null && layer.animOut !== 'none' && layer.outDur !== 0)
    || populated(layer.motionPath) || populated(layer.motionPathTweens)
    || !!layer.clipToPresence
    || (layer.keyframes != null && (typeof layer.keyframes !== 'object' || Array.isArray(layer.keyframes) || Object.values(layer.keyframes).some(populated)))
}
function transformed(layer: RepairLayer) {
  return !!layer.rotation || !!layer.skewX || !!layer.skewY || !!layer.flipX || !!layer.flipY
    || (layer.scaleX != null && layer.scaleX !== 1) || (layer.scaleY != null && layer.scaleY !== 1)
    || !!layer.transform
}
function rectangle(layer: RepairLayer) {
  return ['x', 'y', 'w', 'h'].every(key => typeof layer[key] === 'number' && Number.isFinite(layer[key]))
    && Number(layer.w) > 0 && Number(layer.h) > 0
}
/** Shared fail-closed eligibility for the UI and server; dimensions are required
 * server-side after decoding to establish an uncropped source-to-layer mapping. */
export function letteringRepairEligibilityIssue(layer: RepairLayer, layers: RepairLayer[], region?: LetteringRepairRegion, source?: { width: number, height: number }): string | null {
  if (layer.type !== 'image' || typeof layer.src !== 'string' || !layer.src || !rectangle(layer)) return 'Select a saved image with valid geometry.'
  if (layers.filter(item => item.id === layer.id).length !== 1) return 'The selected image identity is ambiguous.'
  if (layer.locked || layer.hidden || layer.platformQr != null || layer.isLogo || protectedCopy(layer)) return 'Locked, managed QR, logo or protected copy layers cannot be repaired.'
  if (layer.imageCrop || layer.isMask || populated(layer.maskTargetIds) || layers.some(mask => Array.isArray(mask.maskTargetIds) && mask.maskTargetIds.includes(layer.id))) return 'Masked or cropped images need manual reconstruction.'
  if (transformed(layer) || animated(layer) || populated(layer.feedBindings) || (layer.srcType != null && layer.srcType !== 'image')) return 'Transformed, animated or feed-bound images need manual reconstruction.'
  if ((layer.opacity != null && layer.opacity !== 1) || (layer.mixBlendMode != null && layer.mixBlendMode !== 'normal') || (layer.visualFilter != null && layer.visualFilter !== 'none') || !!layer.borderRadius || !!layer.borderWidth) return 'Composited or filtered images need manual reconstruction.'
  if (layer.fit != null && !['fill', 'contain', 'cover'].includes(String(layer.fit))) return 'Unsupported image fit.'
  if (source && layer.fit !== 'fill' && Math.abs(Number(layer.w) / Number(layer.h) - source.width / source.height) > 0.000001) return 'The source image and layer must have the same aspect ratio, or use fill fitting.'
  if (region) {
    const area = { x: Number(layer.x) + region.x * Number(layer.w), y: Number(layer.y) + region.y * Number(layer.h), w: region.w * Number(layer.w), h: region.h * Number(layer.h) }
    for (const other of layers) {
      if (other.id === layer.id || !(other.platformQr != null || other.locked || other.isLogo || protectedCopy(other))) continue
      // Do not guess a rotated/animated protected element's visible extent.
      if (!rectangle(other) || transformed(other) || animated(other)) return 'A protected layer has geometry that cannot be safely mapped.'
      if (area.x < Number(other.x) + Number(other.w) && area.x + area.w > Number(other.x) && area.y < Number(other.y) + Number(other.h) && area.y + area.h > Number(other.y)) return 'The repair region overlaps a protected layer or managed QR code.'
    }
  }
  return null
}
