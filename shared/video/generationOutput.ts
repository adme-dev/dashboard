import { createHash } from 'node:crypto'

/** Identity comes from downloaded bytes, never a caller-supplied digest. */
export function generatedVideoOutputIdentity(bytes: Uint8Array, baseKey: string) {
  if (!bytes.byteLength) throw new Error('Generated video output is empty')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  // Concurrent/late finalizers cannot overwrite the bytes approved by an earlier one.
  const r2Key = baseKey.replace(/\.mp4$/, '') + `-${sha256}.mp4`
  return { sha256, r2Key }
}
