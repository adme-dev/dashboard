import { z } from 'zod'

export const MAX_SCOPED_DISSECTION_ASSETS = 300
export const MAX_SCOPED_DISSECTION_ASSET_BYTES = 10 * 1024 * 1024
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const id = z.string().length(36).regex(new RegExp(`^${uuidPattern}$`))
const keyPattern = new RegExp(`^scoped-dissection-assets/(${uuidPattern})/(${uuidPattern})/(${uuidPattern})\\.png$`)
const locatorPattern = new RegExp(`^/api/agency/banner-studio/dissect/(${uuidPattern})/assets/(${uuidPattern})$`)
export function scopedDissectionAssetKey(jobId: string, attemptId: string, assetId: string): string {
  return `scoped-dissection-assets/${id.parse(jobId)}/${id.parse(attemptId)}/${id.parse(assetId)}.png`
}
export function scopedDissectionAssetLocator(jobId: string, assetId: string): string {
  return `/api/agency/banner-studio/dissect/${id.parse(jobId)}/assets/${id.parse(assetId)}`
}
export function parseScopedDissectionAssetLocator(value: unknown): { jobId: string, assetId: string } | null {
  const match = typeof value === 'string' ? locatorPattern.exec(value) : null
  return match && match[0] === value ? { jobId: match[1]!, assetId: match[2]! } : null
}
export function isScopedDissectionAssetLocator(value: unknown): boolean {
  return parseScopedDissectionAssetLocator(value) !== null
}
// Recognizers are deliberately broader than parsers: aliases must be rejected,
// not treated as ordinary public URLs. No decoding is used to grant access.
function decodedReference(value: unknown): string {
  if (typeof value !== 'string') return ''
  let decoded = value
  for (let i = 0; i < 8; i++) {
    try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next }
    catch { break }
  }
  return decoded.replace(/\\/g, '/').toLowerCase()
}
export function isProtectedDissectionStorageKey(value: unknown): boolean {
  return /(?:scoped-dissection-assets|scoped-banner-exports)(?:\/|$)/.test(decodedReference(value))
}
export function isScopedDissectionAssetReference(value: unknown): boolean {
  const text = decodedReference(value)
  return text.includes('/banner-studio/dissect/') || isProtectedDissectionStorageKey(value)
}
export const scopedDissectionAssetSchema = z.object({
  assetId: id, attemptId: id, key: z.string().regex(keyPattern),
  mimeType: z.literal('image/png'),
  byteLength: z.number().int().min(1).max(MAX_SCOPED_DISSECTION_ASSET_BYTES),
  sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/),
}).strict().refine(entry => {
  const match = keyPattern.exec(entry.key)
  return !!match && match[0] === entry.key && match[2] === entry.attemptId && match[3] === entry.assetId
}, 'Asset key differs from registered identity')
const boundedRecord = z.custom<Record<string, unknown>>(value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length <= MAX_SCOPED_DISSECTION_ASSETS)
export const dissectionDeliverySchema = z.object({
  version: z.literal(1),
  assets: boundedRecord.pipe(z.record(id, scopedDissectionAssetSchema)).refine(assets =>
    Object.entries(assets).every(([assetId, asset]) => asset.assetId === assetId), 'Registry key differs from asset ID'),
}).strict()
export type ScopedDissectionAsset = z.infer<typeof scopedDissectionAssetSchema>
export type DissectionDelivery = z.infer<typeof dissectionDeliverySchema>
