import { isScopedDissectionAssetReference, parseScopedDissectionAssetLocator } from './bannerDissectionDelivery'
/** UX/admission detection only. Saved locators and server-created markers are authority. */
export const SCOPED_DISSECTION_EXCLUSION = 'Protected Dissector artwork supports saved PNG, JPG, GIF and HTML downloads. Publishing, MP4, merging and AI edits are unavailable for this artwork.'
export function hasScopedDissectionReferences(value: unknown): boolean {
  const text = typeof value === 'string' ? value : JSON.stringify(value) || ''
  return isScopedDissectionAssetReference(text) || /"dissectionSource"\s*:/.test(text)
}
export const hasScopedCanvas = hasScopedDissectionReferences
function visit(value: unknown, fn: (value: unknown) => void, depth = 0, budget = { nodes: 0 }): void {
  if (++budget.nodes > 20000 || depth > 32) throw new Error('Protected canvas exceeds inspection limits')
  fn(value)
  if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, fn, depth + 1, budget)
}
export function collectScopedCanvasLocators(canvas: unknown): string[] {
  const found = new Set<string>()
  visit(canvas, value => {
    if (typeof value !== 'string' || !isScopedDissectionAssetReference(value)) return
    if (!parseScopedDissectionAssetLocator(value)) throw new Error('Malformed protected image reference')
    found.add(value)
    if (found.size > 64) throw new Error('Too many protected image references')
  })
  return [...found]
}
export interface ScopedCanvasSource { jobId: string, sourceSha256: string }
export function collectScopedCanvasSources(canvas: unknown): ScopedCanvasSource[] {
  const found = new Map<string, string>()
  visit(canvas, value => {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'dissectionSource')) return
    const marker = (value as { dissectionSource: ScopedCanvasSource }).dissectionSource
    if (!marker || Object.keys(marker).sort().join(',') !== 'jobId,sourceSha256'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(marker.jobId)
      || !/^[a-f0-9]{64}$/.test(marker.sourceSha256)
      || (found.has(marker.jobId) && found.get(marker.jobId) !== marker.sourceSha256)) throw new Error('Malformed protected canvas source')
    found.set(marker.jobId, marker.sourceSha256)
    if (found.size > 8) throw new Error('Too many protected canvas sources')
  })
  return [...found].map(([jobId, sourceSha256]) => ({ jobId, sourceSha256 }))
}
