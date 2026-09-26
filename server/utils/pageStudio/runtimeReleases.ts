import {
  nativeAstroRuntimeContentPrefix,
  verifyNativeAstroRuntimeRelease,
  type NativeAstroRuntimeRelease
} from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { PageStudioPublishingError } from './publishingError'
import { loadApprovedPageStudioReleaseCheckpoint } from './releaseCheckpoint'
import type { PageStudioReleaseMetadata } from './releaseMetadata'
import type { PageStudioPublishingScope } from './publishing'

/**
 * Astro runtime publication (Studio ADR-005). A runtime release pins one approved
 * saved version, its retained media and the renderer generation it will run on.
 * Preparation is content-addressed and idempotent, so it runs before the
 * activation transaction and a retried publish never rewrites published bytes.
 */

export type RuntimeRenderer = NativeAstroRuntimeRelease['renderer']

/** An R2 object: the checkpoint reader streams `body`; retained media uses `arrayBuffer`. */
export interface RuntimeContentObject {
  arrayBuffer(): Promise<ArrayBuffer>
  body: ReadableStream<Uint8Array>
  size: number
}

export interface RuntimeContentBucket {
  get(key: string): Promise<RuntimeContentObject | null>
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>
}

export interface PreparedRuntimeRelease {
  digest: string
  release: NativeAstroRuntimeRelease
  releaseMetadata: PageStudioReleaseMetadata
}

const SHA256 = /^[a-f0-9]{64}$/
const GENERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const MEDIA_REFERENCE = /\/assets\/([a-f0-9]{64})\.(png|jpe?g|gif|webp)/g
const MEDIA_LIMIT_BYTES = 10 * 1024 * 1024
const MEDIA_TOTAL_LIMIT_BYTES = 128 * 1024 * 1024
const SNAPSHOT_TYPE = 'application/json; charset=utf-8'

function unavailable(message: string) {
  return new PageStudioPublishingError('RUNTIME_CONTENT_UNAVAILABLE', 422, message)
}

/** Deployed renderer identity from `PAGE_STUDIO_RUNTIME_RENDERER` (JSON). */
export function resolveRuntimeRenderer(env: Record<string, unknown> | undefined): RuntimeRenderer {
  let parsed: unknown
  try {
    parsed = typeof env?.PAGE_STUDIO_RUNTIME_RENDERER === 'string' ? JSON.parse(env.PAGE_STUDIO_RUNTIME_RENDERER) : undefined
  } catch {
    parsed = undefined
  }
  const value = parsed as Partial<RuntimeRenderer> | undefined
  if (!value || typeof value.generation !== 'string' || !GENERATION.test(value.generation)
    || typeof value.codeDigest !== 'string' || !SHA256.test(value.codeDigest)
    || typeof value.assetsDigest !== 'string' || !SHA256.test(value.assetsDigest)) {
    throw new PageStudioPublishingError('RUNTIME_RENDERER_UNAVAILABLE', 503, 'The Page Studio runtime renderer is not configured for this environment')
  }
  return { assetsDigest: value.assetsDigest, codeDigest: value.codeDigest, generation: value.generation, name: 'astro-runtime' }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function imageType(bytes: Uint8Array, extension: string): string | null {
  const text = new TextDecoder().decode(bytes.slice(0, 12))
  if (extension === 'png' && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if ((extension === 'jpg' || extension === 'jpeg') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (extension === 'gif' && (text.startsWith('GIF87a') || text.startsWith('GIF89a'))) return 'image/gif'
  if (extension === 'webp' && text.startsWith('RIFF') && text.slice(8) === 'WEBP') return 'image/webp'
  return null
}

/** Write content-addressed bytes once; an existing object must already match. */
async function retain(bucket: RuntimeContentBucket, key: string, bytes: Uint8Array, digest: string, contentType: string) {
  const existing = await bucket.get(key)
  if (existing) {
    if (existing.size !== bytes.byteLength || await sha256Hex(await existing.arrayBuffer()) !== digest) {
      throw unavailable('Retained runtime content does not match its digest')
    }
    return
  }
  await bucket.put(key, bytes, { httpMetadata: { contentType } })
}

function redirectsOf(manifest: Record<string, unknown>): NativeAstroRuntimeRelease['redirects'] {
  const pages = new Map((Array.isArray(manifest.pages) ? manifest.pages : [])
    .map(page => page as { id?: string, route?: string, visibility?: string })
    .map(page => [page.id, page]))
  const redirects: NativeAstroRuntimeRelease['redirects'] = {}
  for (const raw of Array.isArray(manifest.redirects) ? manifest.redirects : []) {
    const redirect = raw as { from?: string, toPageId?: string }
    const target = pages.get(redirect.toPageId)
    if (!redirect.from || target?.visibility !== 'public' || !target.route) {
      throw unavailable(`Redirect ${String(redirect.from)} must target a public page`)
    }
    redirects[redirect.from] = { status: 308, target: target.route }
  }
  return redirects
}

export async function preparePageStudioRuntimeRelease(input: {
  bucket: RuntimeContentBucket
  environment: 'staging' | 'production'
  renderer: RuntimeRenderer
  scope: PageStudioPublishingScope
  versionId: string
}, dependencies: { loadCheckpoint?: typeof loadApprovedPageStudioReleaseCheckpoint } = {}): Promise<PreparedRuntimeRelease> {
  const load = dependencies.loadCheckpoint ?? loadApprovedPageStudioReleaseCheckpoint
  // Verifies approval, the checkpoint object key/scope and the canonical digest.
  const checkpoint = await load({ bucket: input.bucket, scope: input.scope, versionId: input.versionId })
  const manifest = checkpoint.manifest as Record<string, unknown>
  const body = new TextEncoder().encode(canonicalJson(manifest))
  if (await sha256Hex(body) !== checkpoint.digest) throw unavailable('Saved version digest mismatch')

  const prefix = nativeAstroRuntimeContentPrefix(input.scope)
  const siteRoot = prefix.slice(0, -'/runtime'.length)
  const snapshotKey = `${prefix}/versions/${checkpoint.digest}/site.json`
  await retain(input.bucket, snapshotKey, body, checkpoint.digest, SNAPSHOT_TYPE)

  const references = new Map<string, string>()
  for (const match of new TextDecoder().decode(body).matchAll(MEDIA_REFERENCE)) references.set(match[1], match[2])
  const images: NativeAstroRuntimeRelease['images'] = []
  let total = 0
  for (const [digest, extension] of [...references].sort()) {
    const key = `${prefix}/assets/${digest}.${extension}`
    // Prefer an already retained copy so a deleted draft upload cannot block republish.
    const source = await input.bucket.get(key) ?? await input.bucket.get(`${siteRoot}/preview-assets/${digest}.${extension}`)
    if (!source || source.size > MEDIA_LIMIT_BYTES) throw unavailable('A saved image is missing or too large')
    const bytes = new Uint8Array(await source.arrayBuffer())
    const contentType = imageType(bytes, extension)
    if (!contentType || await sha256Hex(bytes) !== digest) throw unavailable('A saved image does not match its content address')
    total += bytes.byteLength
    if (total > MEDIA_TOTAL_LIMIT_BYTES) throw unavailable('Saved images exceed the publication limit')
    await retain(input.bucket, key, bytes, digest, contentType)
    images.push({ bytes: bytes.byteLength, contentType, key, sha256: digest })
  }

  const { digest, release } = await verifyNativeAstroRuntimeRelease({
    delivery: 'runtime',
    environment: input.environment,
    images,
    redirects: redirectsOf(manifest),
    renderer: input.renderer,
    schemaVersion: 1,
    scope: input.scope,
    snapshot: { bytes: body.byteLength, contentType: SNAPSHOT_TYPE, key: snapshotKey, sha256: checkpoint.digest },
    versionDigest: checkpoint.digest,
    versionId: input.versionId
  }).catch((error: unknown) => {
    throw error instanceof PageStudioPublishingError ? error : unavailable('Runtime release failed verification')
  })
  return { digest, release, releaseMetadata: checkpoint.releaseMetadata }
}
