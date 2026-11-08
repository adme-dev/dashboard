import { z } from 'zod'
import type { PageStudioCheckpointCommitInput } from './controlTypes'
import type { PageStudioCheckpointBucket } from './checkpointReader'

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Scope = z.object({ tenantId: Id, clientId: Id, siteId: Id }).strict()
export const CodeContentBindingSchema = z.object({
  formatVersion: z.literal(1), kind: z.literal('code-pages'), operationId: Id, indexDigest: Digest, contentDigest: Digest
}).strict()
export type CodeContentBinding = z.infer<typeof CodeContentBindingSchema>
export function canonicalCodeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalCodeJson).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : Number(a > b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalCodeJson(child)}`).join(',')}}`
}
export async function codeSha256(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function sameCodeContent(a: unknown, b: unknown) {
  return canonicalCodeJson(a ?? null) === canonicalCodeJson(b ?? null)
}

const Operation = z.object({ actorId: Id, checkpointId: Id, contentDigest: Digest, createdAt: z.string().datetime(), expectedCheckpointId: Id, operationId: Id }).strict()
const Intent = z.object({ schemaVersion: z.literal(1), scope: Scope, operation: Operation }).strict()
const Prepared = Intent.extend({ contentDigest: Digest, indexDigest: Digest }).strict()
const Envelope = z.object({ schemaVersion: z.literal(2), checkpointId: Id, createdAt: z.string().datetime(), digest: Digest,
  manifest: z.record(z.string(), z.unknown()), scope: Scope, userId: Id, codeContent: CodeContentBindingSchema }).strict()
const File = z.string().min(1).max(1024).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/)
const Route = z.string().max(385).regex(/^\/(?:[a-z0-9][a-z0-9-]{0,62}(?:\/[a-z0-9][a-z0-9-]{0,62}){0,5}\/?){0,1}$/)
const Bytes = z.number().int().positive().max(10 * 1024 * 1024)
const Page = z.object({ route: Route, file: File, bytes: Bytes.max(2 * 1024 * 1024), sha256: Digest, sourceUrl: z.string().url().max(2048) }).strict()
const Resource = z.object({ path: z.string().max(1025), file: File, bytes: Bytes, sha256: Digest,
  contentType: z.string().min(1).max(200).regex(/^[\x20-\x7e]+$/) }).strict()
const Inventory = z.object({ format: z.literal('xeroflow-code-page-source-export'), schemaVersion: z.literal(1), sourceCheckpointId: Id,
  pages: z.array(Page).min(1).max(20), resources: z.array(Resource).max(512) }).strict()
const Inspection = z.discriminatedUnion('policy', [
  z.object({ policy: z.literal('static-closure-v1'), candidateDigest: Digest }).strict(),
  z.object({ policy: z.literal('reviewed-inline-static-css-v1'), candidateDigest: Digest, reviewDigest: Digest }).strict()
])
const Package = z.object({ format: z.literal('xeroflow-code-page-content-package'), schemaVersion: z.literal(1), inventory: Inventory,
  inventoryDigest: Digest, rootRedirect: z.object({ from: z.literal('/'), to: Route }).strict().nullable(), inspection: Inspection }).strict()
const Review = z.object({ policy: z.literal('reviewed-inline-static-css-v1'), inventoryDigest: Digest, evidenceSha256: Digest,
  reviewId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/), pages: z.array(z.object({
    file: File, sha256: Digest, scripts: z.array(z.object({ sha256: Digest, bytes: Bytes.max(2 * 1024 * 1024) }).strict()).max(64),
    dataAttributes: z.array(z.string().min(6).max(64).regex(/^data-[a-z0-9_.:-]+$/)).max(128),
    dynamicResources: z.array(z.object({ kind: z.enum(['image', 'style', 'font']), path: z.string().max(1025) }).strict()).max(512),
    externalNavigations: z.array(z.string().url().max(2048)).max(512), requiredIds: z.array(z.string().min(1).max(256)).max(512)
  }).strict()).min(1).max(20) }).strict()
const Registration = z.discriminatedUnion('policy', [
  z.object({ schemaVersion: z.literal(1), scope: Scope, contentDigest: Digest, policy: z.literal('static-closure-v1') }).strict(),
  z.object({ schemaVersion: z.literal(1), scope: Scope, contentDigest: Digest, policy: z.literal('reviewed-inline-static-css-v1'), review: Review }).strict()
])

function requireValue(value: unknown): asserts value {
  if (!value) throw new Error('Imported checkpoint content is unavailable or mismatched')
}
async function readBytes(bucket: PageStudioCheckpointBucket, key: string, limit: number): Promise<Uint8Array> {
  const object = await bucket.get(key)
  requireValue(object && (object.size === undefined || (Number.isSafeInteger(object.size) && object.size >= 1 && object.size <= limit)))
  const reader = object.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      requireValue(part.value instanceof Uint8Array)
      size += part.value.length
      requireValue(size <= limit)
      chunks.push(new Uint8Array(part.value))
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally { reader.releaseLock() }
  requireValue(size > 0 && (object.size === undefined || object.size === size))
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of chunks) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
/** Verify large package files without retaining/copying their complete bodies.
 * Keep node:crypto inside this server-only path: this module also exports pure
 * comparison helpers consumed by the browser. */
async function verifyFileBytes(bucket: PageStudioCheckpointBucket, key: string, expectedBytes: number, expectedDigest: string) {
  const { createHash } = await import('node:crypto')
  const object = await bucket.get(key)
  requireValue(object)
  const reader = object.body.getReader()
  let size = 0
  try {
    requireValue(object.size === undefined || (Number.isSafeInteger(object.size) && object.size === expectedBytes))
    const hash = createHash('sha256')
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      requireValue(part.value instanceof Uint8Array)
      size += part.value.byteLength
      requireValue(size <= expectedBytes)
      hash.update(part.value)
    }
    requireValue(size === expectedBytes && hash.digest('hex') === expectedDigest)
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally { reader.releaseLock() }
}
async function readJson(bucket: PageStudioCheckpointBucket, key: string, limit: number, canonical = true) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(bucket, key, limit))
  const value: unknown = JSON.parse(text)
  requireValue(!canonical || canonicalCodeJson(value) === text)
  return value
}

/** Immutable bytes only. Call before native CAS, then enforce fresh authority and
 * allowance under the site/entitlement lock. Registry objects are operator-owned,
 * never supplied or writable by an imported tenant packet. This is not acceptance. */
export async function verifyCodePageImport(raw: PageStudioCheckpointCommitInput, bucket: PageStudioCheckpointBucket) {
  const input = structuredClone(raw)
  const { checkpoint, expectedCheckpointId } = input
  const binding = CodeContentBindingSchema.parse(checkpoint.codeContent)
  const scope = Scope.parse(checkpoint.scope)
  requireValue(expectedCheckpointId && expectedCheckpointId !== checkpoint.checkpointId)
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}`
  const key = `${prefix}/checkpoints/${Id.parse(checkpoint.checkpointId)}.json`
  requireValue(checkpoint.objectKey === key)
  const envelope = Envelope.parse(await readJson(bucket, key, 8 * 1024 * 1024, false))
  requireValue(envelope.checkpointId === checkpoint.checkpointId && envelope.createdAt === checkpoint.createdAt && envelope.userId === checkpoint.userId
    && sameCodeContent(envelope.scope, scope) && sameCodeContent(envelope.codeContent, binding) && envelope.digest === checkpoint.digest
    && envelope.manifest.id === scope.siteId && await codeSha256(canonicalCodeJson(envelope.manifest)) === checkpoint.digest)
  const operationPrefix = `${prefix}/code-pages/imports/v1/${binding.operationId}`
  const prepared = Prepared.parse(await readJson(bucket, `${operationPrefix}/prepared.json`, 256 * 1024))
  const intent = Intent.parse(await readJson(bucket, `${operationPrefix}/intent.json`, 256 * 1024))
  const expectedOperation = { actorId: checkpoint.userId, checkpointId: checkpoint.checkpointId, createdAt: checkpoint.createdAt,
    expectedCheckpointId, operationId: binding.operationId, contentDigest: binding.contentDigest }
  requireValue(sameCodeContent(intent, { schemaVersion: 1, scope, operation: expectedOperation })
    && sameCodeContent(prepared, { ...intent, contentDigest: binding.contentDigest, indexDigest: binding.indexDigest }))
  const packagePrefix = `${prefix}/code-pages/packages/v1/${binding.contentDigest}`
  const content = Package.parse(await readJson(bucket, `${packagePrefix}/manifest.json`, 2 * 1024 * 1024))
  requireValue(await codeSha256(canonicalCodeJson(content)) === binding.contentDigest
    && await codeSha256(canonicalCodeJson(content.inventory)) === content.inventoryDigest)
  const scopedReviewKey = `${prefix}/code-pages/reviews/v1/${binding.contentDigest}.json`
  const scopedReview = await bucket.get(scopedReviewKey)
  // Presence selects the scope-local review permanently; malformed scoped data
  // must never fall back to a legacy review for another operation or account.
  await scopedReview?.body.cancel()
  const registration = Registration.parse(await readJson(bucket, scopedReview ? scopedReviewKey : `platform/code-page-import-reviews/v1/${binding.contentDigest}.json`, 2 * 1024 * 1024))
  requireValue(sameCodeContent(registration.scope, scope) && registration.contentDigest === binding.contentDigest && registration.policy === content.inspection.policy)
  if (registration.policy === 'reviewed-inline-static-css-v1') {
    requireValue(content.inspection.policy === registration.policy && registration.review.inventoryDigest === content.inventoryDigest
      && await codeSha256(canonicalCodeJson(registration.review)) === content.inspection.reviewDigest)
  }
  const entries = [...content.inventory.pages, ...content.inventory.resources]
  requireValue(entries.reduce((total, entry) => total + entry.bytes, 0) <= 10 * 1024 * 1024
    && new Set(entries.map(entry => entry.file.toLowerCase())).size === entries.length
    && new Set(content.inventory.pages.map(page => page.route)).size === content.inventory.pages.length)
  for (const page of content.inventory.pages) requireValue(page.file === (page.route === '/' ? 'index.html' : `${page.route.slice(1).replace(/\/$/, '')}/index.html`))
  for (const resource of content.inventory.resources) requireValue(resource.path === `/${resource.file}` && /^(?:assets|vendor)\//.test(resource.file))
  if (content.rootRedirect) requireValue(content.rootRedirect.to !== '/' && content.inventory.pages.some(page => page.route === content.rootRedirect!.to)
    && !content.inventory.pages.some(page => page.route === '/'))
  const expectedIndex = { schemaVersion: 2, checkpointId: checkpoint.checkpointId, parentIndexId: null, previousCheckpointId: expectedCheckpointId,
    rootRedirect: content.rootRedirect, pages: Object.fromEntries(content.inventory.pages.map(page => [page.route, {
      htmlDigest: page.sha256, savedAt: checkpoint.createdAt, sourceUrl: page.sourceUrl,
      origin: { kind: 'content-package', operationId: binding.operationId, packageDigest: binding.contentDigest, sourceRoute: page.route },
      resources: { kind: 'content-package', packageDigest: binding.contentDigest }
    }])) }
  const index = await readJson(bucket, `${operationPrefix}/index.json`, 256 * 1024)
  requireValue(sameCodeContent(index, expectedIndex) && await codeSha256(canonicalCodeJson(index)) === binding.indexDigest)
  for (const entry of entries) {
    await verifyFileBytes(bucket, `${packagePrefix}/files/${await codeSha256(entry.file)}`, entry.bytes, entry.sha256)
  }
  return {
    codeContent: binding,
    pageCount: content.inventory.pages.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    routes: content.inventory.pages.map(page => page.route),
    inventoryDigest: content.inventoryDigest,
    provenance: {
      policy: registration.policy,
      candidateDigest: content.inspection.candidateDigest,
      ...(registration.policy === 'reviewed-inline-static-css-v1' && content.inspection.policy === 'reviewed-inline-static-css-v1'
        ? { reviewDigest: content.inspection.reviewDigest, reviewId: registration.review.reviewId, evidenceSha256: registration.review.evidenceSha256 }
        : {})
    }
  }
}
