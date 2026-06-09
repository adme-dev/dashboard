interface R2Putable { put(key: string, value: ArrayBuffer | Uint8Array, options?: any): Promise<unknown> }

/** Fetch a generated-video URL and store the bytes in R2. Throws on a bad download
 *  so the caller can mark the job failed. */
export async function downloadToR2(bucket: R2Putable, fetchImpl: typeof fetch, url: string, r2Key: string): Promise<void> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const bytes = await res.arrayBuffer()
  await bucket.put(r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
}
