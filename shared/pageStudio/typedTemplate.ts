import { z } from 'zod'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from './checkpointReader'
import type { PageStudioCheckpointCommitInput } from './controlTypes'
import { canonicalCodeJson, codeSha256 } from './codeContent'
import { verifyTypedTemplateManifest } from './generated/builderGraphVerifier.mjs'

const image = /^\/assets\/([a-f0-9]{64})\.png$/
const forbidden = new Set(['builderApplication', 'builderLibrary', 'contentBinding', 'integrations'])

async function boundedBytes(bucket: PageStudioCheckpointBucket, key: string, limit: number) {
  const object = await bucket.get(key)
  if (!object || (object.size !== undefined && (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > limit))) throw new Error('Typed template asset unavailable')
  const reader = object.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > limit) throw new Error('Typed template asset exceeds limit')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** Typed templates retain their exact manifest and content-addressed images.
 * Native accepted checkpoint provenance is established separately by the caller. */
export async function verifyTypedTemplateSource(source: PageStudioCheckpointCommitInput, bucket: PageStudioCheckpointBucket) {
  if (source.checkpoint.codeContent) throw new Error('Expected typed template')
  const loaded = await loadPageStudioCheckpoint({ bucket, scope: source.checkpoint.scope,
    checkpointId: source.checkpoint.checkpointId, objectKey: source.checkpoint.objectKey, digests: [source.checkpoint.digest] })
  const validated = await verifyTypedTemplateManifest(loaded.manifest)
  if (canonicalCodeJson(validated.manifest) !== canonicalCodeJson(loaded.manifest)) throw new Error('Typed template normalization is not permitted')
  const paths = new Set<string>()
  const inspect = (value: unknown): void => {
    if (typeof value === 'string' && value.startsWith('/assets/')) {
      if (!image.test(value)) throw new Error('Only owned normalized template images are supported')
      paths.add(value)
      if (paths.size > 32) throw new Error('Too many template assets')
    } else if (Array.isArray(value)) value.forEach(inspect)
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (forbidden.has(key)) throw new Error('Template contains scoped runtime bindings')
        inspect(child)
      }
    }
  }
  inspect(validated.manifest)
  const scope = source.checkpoint.scope
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}`
  const inventory: Array<{ path: string, sha256: string, bytes: number, contentType: 'image/png' }> = []
  let totalBytes = new TextEncoder().encode(canonicalCodeJson(validated.manifest)).length
  for (const path of [...paths].sort()) {
    const hash = image.exec(path)![1]!
    const bytes = await boundedBytes(bucket, `${prefix}/preview-assets/${hash}.png`, 8 * 1024 * 1024)
    totalBytes += bytes.length
    if (totalBytes > 64 * 1024 * 1024 || bytes.length < 24
      || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      || await codeSha256(bytes) !== hash) throw new Error('Typed template image verification failed')
    const receiptBytes = await boundedBytes(bucket, `${prefix}/media-library/${hash}.json`, 8192)
    const receipt = z.object({ createdAt: z.string().datetime(), asset: z.object({
      path: z.literal(path), sha256: z.literal(hash), bytes: z.literal(bytes.length), contentType: z.literal('image/png'),
      width: z.number().int().positive().max(2048), height: z.number().int().positive().max(2048)
    }).strict() }).strict().parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes)))
    const dimensions = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (dimensions.getUint32(16) !== receipt.asset.width || dimensions.getUint32(20) !== receipt.asset.height) throw new Error('Typed template image metadata mismatch')
    inventory.push({ path, sha256: hash, bytes: bytes.length, contentType: 'image/png' })
  }
  return { format: 'typed' as const, codeContent: undefined, manifest: validated.manifest,
    pageCount: validated.pageCount, totalBytes, inventoryDigest: await codeSha256(canonicalCodeJson(inventory)),
    provenance: { policy: 'typed-owned-images-v1', checkpointDigest: loaded.digest } }
}
