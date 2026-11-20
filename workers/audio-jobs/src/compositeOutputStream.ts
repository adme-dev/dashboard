import { createRenderDeadline, VIDEO_PROGRESS_INTERVAL_MS, VIDEO_PROGRESS_REQUEST_MS } from '../../../shared/video/renderExecution'
interface OutputBucket {
  put(key: string, body: ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string } }): Promise<unknown>
}
/** R2 requires a known-length stream. Both production and consumption must settle
 * before success; a storage failure cancels the container response immediately. */
export async function putCompositeOutput(bucket: OutputBucket, key: string, response: Response, options: { signal?: AbortSignal; onProgress?(done: number, total: number): void | Promise<void> } = {}): Promise<void> {
  const header = response.headers.get('content-length')
  const length = header && /^\d+$/.test(header) ? Number(header) : NaN
  if (!response.body || !Number.isSafeInteger(length) || length <= 0 || length > 512 * 1024 * 1024) {
    await response.body?.cancel().catch(() => {})
    throw new Error('Composite output length unavailable or unsupported')
  }
  const stream = new FixedLengthStream(length)
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) {
    await response.body.cancel().catch(() => {})
    throw options.signal.reason
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  const report = async (done: number) => {
    if (!options.onProgress || options.signal?.aborted) return
    const advisory = createRenderDeadline(VIDEO_PROGRESS_REQUEST_MS, { signal: options.signal })
    try { await advisory.run(async () => { await options.onProgress!(done, length) }) }
    catch { /* advisory reporting cannot break storage */ }
    finally { advisory.dispose() }
  }
  await report(0)
  let transferred = 0
  let lastReport = Date.now()
  const source = options.onProgress ? response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, output) {
      transferred += chunk.byteLength
      if (transferred < length && Date.now() - lastReport >= VIDEO_PROGRESS_INTERVAL_MS) { lastReport = Date.now(); await report(transferred) }
      output.enqueue(chunk)
    }
  })) : response.body
  const pumping = source.pipeTo(stream.writable, { signal: controller.signal })
  const uploading = Promise.resolve().then(() => bucket.put(key, stream.readable, { httpMetadata: { contentType: 'video/mp4' } }))
  try {
    await Promise.all([pumping, uploading])
    await report(length)
  } catch (error) {
    controller.abort(error)
    // If put rejected before acquiring a reader, release FixedLengthStream
    // backpressure as well; aborting pipeTo alone can wait on its pending write.
    await stream.readable.cancel(error).catch(() => {})
    await Promise.allSettled([pumping, uploading])
    throw error
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
