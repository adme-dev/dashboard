/** Bound object reads by declared bytes, chunk count and total elapsed time.
 * No arrayBuffer() on unknown bodies and no cleanup wait on a stalled source. */
export async function readBoundedBannerObjectBody(
  body: ReadableStream<Uint8Array>, expectedBytes: number, maxBytes: number, timeoutMs = 30_000
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > maxBytes) {
    void body.cancel().catch(() => {})
    throw new Error('Object size exceeds its limit')
  }
  const reader = body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Object read timed out')), timeoutMs)
  })
  const bytes = new Uint8Array(expectedBytes)
  let offset = 0
  let chunks = 0
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      if (++chunks > 65_536 || !(value instanceof Uint8Array) || value.byteLength > bytes.length - offset) {
        throw new Error('Object body exceeds its limit')
      }
      bytes.set(value, offset)
      offset += value.byteLength
    }
    if (offset !== expectedBytes) throw new Error('Object body is truncated')
    return bytes
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
