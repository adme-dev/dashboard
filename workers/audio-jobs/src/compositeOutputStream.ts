interface OutputBucket {
  put(key: string, body: ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string } }): Promise<unknown>
}
/** R2 requires a known-length stream. Both production and consumption must settle
 * before success; a storage failure cancels the container response immediately. */
export async function putCompositeOutput(bucket: OutputBucket, key: string, response: Response): Promise<void> {
  const header = response.headers.get('content-length')
  const length = header && /^\d+$/.test(header) ? Number(header) : NaN
  if (!response.body || !Number.isSafeInteger(length) || length <= 0 || length > 512 * 1024 * 1024) {
    await response.body?.cancel().catch(() => {})
    throw new Error('Composite output length unavailable or unsupported')
  }
  const stream = new FixedLengthStream(length)
  const controller = new AbortController()
  const pumping = response.body.pipeTo(stream.writable, { signal: controller.signal })
  const uploading = Promise.resolve().then(() => bucket.put(key, stream.readable, { httpMetadata: { contentType: 'video/mp4' } }))
  try {
    await Promise.all([pumping, uploading])
  } catch (error) {
    controller.abort(error)
    // If put rejected before acquiring a reader, release FixedLengthStream
    // backpressure as well; aborting pipeTo alone can wait on its pending write.
    await stream.readable.cancel(error).catch(() => {})
    await Promise.allSettled([pumping, uploading])
    throw error
  }
}
