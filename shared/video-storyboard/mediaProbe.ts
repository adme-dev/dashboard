/** Data-only contract. Never accepts URLs or trusts an asset's declared MIME/duration. */
export const MAX_PROBE_BYTES = 64 * 1024 * 1024
export interface MediaProbeInput {
  r2Key: string
  expectedEtag: string
  expectedSize: number
}
export interface MeasuredMedia {
  kind: 'video' | 'image' | 'audio'
  durationSeconds: number | null
  width?: number
  height?: number
}
export function validateProbeInput(
  value: unknown
): asserts value is MediaProbeInput {
  const v = value as MediaProbeInput
  // Reject control bytes in object keys at the private service boundary.

  if (
    !v
    || typeof v.r2Key !== 'string'
    || !v.r2Key
    || v.r2Key.length > 1024
    // eslint-disable-next-line no-control-regex -- Reject control bytes in private object keys.
    || /[:\\\u0000-\u001f]/.test(v.r2Key)
    || v.r2Key.startsWith('/')
    || v.r2Key.split('/').includes('..')
    || typeof v.expectedEtag !== 'string'
    || !v.expectedEtag
    || v.expectedEtag.length > 128
    || !Number.isSafeInteger(v.expectedSize)
    || v.expectedSize <= 0
    || v.expectedSize > MAX_PROBE_BYTES
  )
    throw new Error('Invalid media probe fingerprint')
}
export function validateMeasuredMedia(value: unknown): MeasuredMedia {
  const v = value as MeasuredMedia
  if (
    !v
    || !['video', 'image', 'audio'].includes(v.kind)
    || (v.kind === 'image'
      ? v.durationSeconds !== null
      : typeof v.durationSeconds !== 'number'
        || !Number.isFinite(v.durationSeconds)
        || v.durationSeconds <= 0
        || v.durationSeconds > 3600)
  )
    throw new Error('Invalid media measurement')
  if (
    v.kind !== 'audio'
    && ![v.width, v.height].every(
      n => Number.isSafeInteger(n) && n! > 0 && n! <= 8192
    )
  )
    throw new Error('Invalid media dimensions')
  return {
    kind: v.kind,
    durationSeconds: v.durationSeconds,
    ...(v.kind !== 'audio' ? { width: v.width, height: v.height } : {})
  }
}
export async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number
): Promise<Uint8Array> {
  if (!stream) throw new Error('Missing media body')
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    void reader.cancel().catch(() => {})
  }, 10_000)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (expired) throw new Error('Media body timed out')
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Media body exceeds limit')
      chunks.push(value)
    }
  } finally {
    clearTimeout(timer)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function probeDeadline<T>(
  task: Promise<T>,
  milliseconds: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Media probe timed out')),
          milliseconds
        )
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
