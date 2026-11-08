import { mp4Dimensions } from './mp4Dimensions'
import { downloadGeneratedVideoOutput } from '../../../server/utils/video-generation/outputDownload'
import { generatedVideoOutputIdentity } from '../../../shared/video/generationOutput'

interface R2Putable { put(key: string, value: ArrayBuffer | Uint8Array, options?: any): Promise<unknown> }

/** Fetch a generated-video URL and store the bytes in R2. Throws on a bad download
 *  so the caller retains uncertain liability for reconciliation. */
export async function downloadToR2(bucket: R2Putable, fetchImpl: typeof fetch, url: string, r2Key: string, options: { contentAddressed?: boolean } = {}): Promise<{ r2Key: string, sha256: string, dimensions: ReturnType<typeof mp4Dimensions> }> {
  const bytes = await downloadGeneratedVideoOutput(url, fetchImpl)
  const identity = generatedVideoOutputIdentity(new Uint8Array(bytes), r2Key)
  const key = options.contentAddressed ? identity.r2Key : r2Key
  await bucket.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' }, customMetadata: { sha256: identity.sha256 } })
  return { r2Key: key, sha256: identity.sha256, dimensions: mp4Dimensions(new Uint8Array(bytes).slice().buffer) }
}
