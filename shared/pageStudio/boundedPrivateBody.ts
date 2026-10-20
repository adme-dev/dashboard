export async function boundedBody(request: Pick<Request, 'body'>, maximum = 4096) {
  const reader = request.body?.getReader()
  if (!reader) return { tooLarge: false, value: null }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) {
        // A cloned Request has a second stream branch; cancellation can wait for
        // that branch indefinitely. Stop our reader without awaiting its sibling.
        void reader.cancel().catch(() => {})
        return { tooLarge: true, value: null }
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { tooLarge: false, value: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown }
  } catch { return { tooLarge: false, value: null } }
}
