// The contract between Banner Studio's "Import image as layers" routes and the editor.
// The job itself is the asset-intelligence Worker's Separate layers job.

export interface BannerLayerImportBox { x: number, y: number, width: number, height: number }

/** What the Worker read from a lettering-only element (server/utils/image-layers/readText.ts). */
export interface BannerLayerImportText {
  text: string
  lines: number
  fontGuess: string | null
  fontCategory: 'sans' | 'serif' | 'slab' | 'script' | 'display' | 'mono'
  fontWeight: number
  italic: boolean
  uppercase: boolean
  align: 'left' | 'center' | 'right'
  color: string | null
  letterSpacing: 'tight' | 'normal' | 'wide'
}

export interface BannerLayerImportLayer {
  /** The cut-out, saved to the Banner Studio media library. */
  assetId: string
  url: string
  name: string
  /** text, logo, button, badge, product, subject or graphic. */
  kind: string
  /** Stacking order, back to front. */
  z: number
  /** Where the element sits in the source picture, in source pixels. */
  bbox: BannerLayerImportBox
  width: number
  height: number
  text: BannerLayerImportText | null
}

export interface BannerLayerImportSkip { name: string, step: string, reason: string }

export interface BannerLayerImportResult {
  /** Source picture size. Every bbox is in these pixels. */
  width: number
  height: number
  base: { assetId: string, url: string, width: number, height: number } | null
  layers: BannerLayerImportLayer[]
  skipped: BannerLayerImportSkip[]
  costUsd: number | null
  latencyMs: number | null
}

export type BannerLayerImportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface BannerLayerImportStatus {
  jobId: string
  status: BannerLayerImportJobStatus
  error: string | null
  createdAt: string | null
  startedAt: string | null
  result: BannerLayerImportResult | null
}

// Published prices behind the estimate, kept in step with server/utils/image-layers by a test.
export const LAYER_IMPORT_MAX_ELEMENTS = 8
export const LAYER_IMPORT_USD_PER_PICTURE = 0.028
export const LAYER_IMPORT_USD_FOR_READING = 0.01
/** The Worker refuses or trims any job estimated above this. */
export const LAYER_IMPORT_MAX_JOB_USD = 0.5
export const LAYER_IMPORT_TYPICAL_SECONDS = 70
export const LAYER_IMPORT_MIME_TYPES = ['image/jpeg', 'image/png']

/** The most one import can cost: every element, the background, and the two reading passes. */
export function layerImportMaxCostUsd(elements = LAYER_IMPORT_MAX_ELEMENTS): number {
  return Math.round(((elements + 1) * LAYER_IMPORT_USD_PER_PICTURE + LAYER_IMPORT_USD_FOR_READING) * 1000) / 1000
}
