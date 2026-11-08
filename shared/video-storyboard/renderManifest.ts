/** Data-only contract shared by dispatch and the queue consumer. */
export interface PinnedRenderObject {
  key: string
  sourceKey: string
  etag: string
  size: number
  sha256: string
}
export interface RenderOverlay {
  clipId: string
  htmlKey: string
  timeline_start_sec: number
  duration_sec: number
  requiredCopy?: CopyRequirement[]
}
export interface CopyRequirement {
  clipId: string
  text: string
  startSec: number
  durationSec: number
}
export interface CopyMeasurementInput {
  html: string
  width: number
  height: number
  durationSec: number
  fps: number
  required: CopyRequirement[]
}
export interface CopyMeasurementFinding {
  code: string
  severity: 'blocker'
  message: string
}
export interface StoryboardRenderManifest {
  id: string
  jobId: string
  projectId: string
  timelineId: string
  editRevision: number
  formats: string[]
  state: unknown
  resolvedOverlaysByFormat: Record<string, RenderOverlay[]>
  objects: PinnedRenderObject[]
  /** Server-owned reference/approval fingerprints. Never interpreted by the renderer. */
  dependencies?: unknown
}
export interface RenderPinBucket {
  get(key: string, options: { onlyIf: { etagMatches: string } }): Promise<{
    etag: string
    size: number
    arrayBuffer?: () => Promise<ArrayBuffer>
  } | null>
  put(key: string, bytes: ArrayBuffer, options?: unknown): Promise<unknown>
}
export async function renderBytesHash(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}
export async function verifyPinnedObject(bytes: ArrayBuffer, object: PinnedRenderObject): Promise<void> {
  if (bytes.byteLength !== object.size || await renderBytesHash(bytes) !== object.sha256)
    throw new Error('Pinned render input changed')
}
/** Caller resolves ownership first. A conditional read prevents dispatch TOCTOU. */
export async function pinStoryboardObject(
  bucket: RenderPinBucket,
  source: { key: string, etag: string, size: number },
  jobId: string
): Promise<PinnedRenderObject> {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId) || !source.etag || !Number.isSafeInteger(source.size) || source.size <= 0 || source.size > 64 * 1024 * 1024)
    throw new Error('Invalid render source fingerprint')
  const object = await bucket.get(source.key, { onlyIf: { etagMatches: source.etag } })
  if (!object?.arrayBuffer || object.etag !== source.etag || object.size !== source.size)
    throw new Error('Render source fingerprint changed')
  const bytes = await object.arrayBuffer()
  if (bytes.byteLength !== source.size) throw new Error('Render source size changed')
  const sha256 = await renderBytesHash(bytes)
  const key = `storyboard-render-inputs/${jobId}/${sha256}`
  await bucket.put(key, bytes)
  return { key, sourceKey: source.key, etag: source.etag, size: source.size, sha256 }
}
