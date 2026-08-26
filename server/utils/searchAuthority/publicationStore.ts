import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { SearchAuthorityHostAlias, SearchAuthorityPublicationManifest, SearchAuthorityPublishedGuide, SearchAuthorityPublishingMode } from '~~/shared/searchAuthorityPublication'
import type { RenderedPublication } from '~~/server/utils/searchAuthority/publicationRenderer'
import { renderPublicationHub, renderPublicationRobots, renderPublicationSitemap } from '~~/server/utils/searchAuthority/publicationRenderer'
import { getCachedObjectBinding } from '~~/server/utils/email'

interface StoredTextObject {
  text: () => Promise<string>
}

export interface SearchAuthorityPublicationBucket {
  put: (key: string, value: string, options?: {
    httpMetadata?: { contentType?: string, cacheControl?: string }
    customMetadata?: Record<string, string>
  }) => Promise<{ key?: string, etag?: string } | null>
  get: (key: string) => Promise<StoredTextObject | null>
  head: (key: string) => Promise<{ key?: string, etag?: string, customMetadata?: Record<string, string> } | null>
  delete: (key: string) => Promise<void>
}

export interface ActivatePublicationInput {
  hostname: string
  assetId: string
  versionId: string
  publicationId: string
  slug: string
  rendered: RenderedPublication
  activatedAt: string
  /** Site public id + mode; written to `aliases/<publicId>.json` for same-host rewrites. */
  publicId: string
  mode: SearchAuthorityPublishingMode
  brandName: string
  dealershipUrl: string
  /** This guide's listing entry; other guides are carried over from the previous manifest. */
  guide: SearchAuthorityPublishedGuide
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const UUID = /^[a-f0-9-]{36}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function activateSearchAuthorityPublication(
  bucket: SearchAuthorityPublicationBucket,
  input: ActivatePublicationInput
): Promise<{ manifestVersion: string, previousManifestVersion: string | null, manifest: SearchAuthorityPublicationManifest }> {
  const hostname = safeHostname(input.hostname)
  if (!UUID.test(input.assetId) || !UUID.test(input.versionId) || !UUID.test(input.publicationId)) {
    throw new Error('Publication identifiers must be UUIDs')
  }
  if (!SLUG.test(input.slug)) throw new Error('Publication slug is invalid')
  if (new URL(input.rendered.canonicalUrl).hostname !== hostname) {
    throw new Error('Rendered canonical hostname does not match the publication hostname')
  }
  if (!UUID.test(input.publicId)) throw new Error('Site public id must be a UUID')
  const base = `hosts/${hostname}/versions/${input.assetId}/${input.versionId}`
  const htmlKey = `${base}/index.html`
  const sitemapKey = `${base}/sitemap.xml`
  const robotsKey = `${base}/robots.txt`
  const hubKey = `${base}/hub.html`

  // Carry every other asset's guide route over from the current manifest so a site can
  // hold many guides; this asset's own previous route (a re-publish) is replaced.
  const previous = await readManifest(bucket, currentManifestKey(hostname))
  const carried: Record<string, { key: string, contentType: RenderedPublication['contentType'], etag: string }> = {}
  const carriedGuides: SearchAuthorityPublishedGuide[] = []
  for (const [path, route] of Object.entries(previous?.routes ?? {})) {
    const match = /^\/guides\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path)
    if (!match || match[1] === input.slug) continue
    if (route.key.includes(`/versions/${input.assetId}/`)) continue
    if (!route.key.startsWith(`hosts/${hostname}/versions/`) || route.contentType !== 'text/html; charset=utf-8') continue
    carried[path] = { key: route.key, contentType: route.contentType, etag: route.etag }
    const listed = previous?.guides?.find(guide => guide.slug === match[1])
    if (listed) carriedGuides.push(listed)
  }
  const guides = [input.guide, ...carriedGuides.filter(guide => guide.slug !== input.slug)]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const canonicalUrls = guides.map(guide => `https://${hostname}/guides/${guide.slug}`)
  const sitemap = renderPublicationSitemap(canonicalUrls)
  const robots = renderPublicationRobots(hostname)
  const hub = renderPublicationHub({ hostname, brandName: input.brandName, dealershipUrl: input.dealershipUrl, guides })

  await putImmutable(bucket, htmlKey, input.rendered.html, input.rendered.contentType, input.rendered.etag)
  await putImmutable(bucket, hubKey, hub.html, 'text/html; charset=utf-8', hub.etag)
  await putImmutable(bucket, sitemapKey, sitemap, 'application/xml; charset=utf-8', sha256(sitemap))
  await putImmutable(bucket, robotsKey, robots, 'text/plain; charset=utf-8', sha256(robots))

  const manifestVersion = `${input.activatedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${input.versionId.slice(0, 8)}-${input.rendered.etag.slice(0, 12)}`
  const sitemapRoute = { key: sitemapKey, contentType: 'application/xml; charset=utf-8' as const, etag: sha256(sitemap) }
  const hubRoute = { key: hubKey, contentType: 'text/html; charset=utf-8' as const, etag: hub.etag }
  const manifest: SearchAuthorityPublicationManifest = {
    schemaVersion: 1,
    hostname,
    manifestVersion,
    publicationId: input.publicationId,
    versionId: input.versionId,
    activatedAt: input.activatedAt,
    publicId: input.publicId,
    mode: input.mode,
    guides,
    routes: {
      ...carried,
      [`/guides/${input.slug}`]: { key: htmlKey, contentType: input.rendered.contentType, etag: input.rendered.etag },
      '/guides': hubRoute,
      '/sitemap.xml': sitemapRoute,
      // Same-host clients rewrite only `/guides/*`, so the sitemap must also live under the prefix.
      '/guides/sitemap.xml': sitemapRoute,
      '/robots.txt': { key: robotsKey, contentType: 'text/plain; charset=utf-8', etag: sha256(robots) }
    },
    // On the subdomain the root is the hub; on the client's own host `/` belongs to them.
    redirects: input.mode === 'subdomain' ? { '/': '/guides' } : {}
  }
  const manifestBody = JSON.stringify(manifest)
  const versionedManifestKey = manifestKey(hostname, manifestVersion)
  await putImmutable(bucket, versionedManifestKey, manifestBody, 'application/json; charset=utf-8', sha256(manifestBody))

  const alias: SearchAuthorityHostAlias = { hostname, mode: input.mode }
  await bucket.put(`aliases/${input.publicId}.json`, JSON.stringify(alias), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
  })
  await putCurrentManifest(bucket, hostname, manifest)
  return {
    manifestVersion,
    previousManifestVersion: previous?.manifestVersion ?? null,
    manifest
  }
}

export async function rollbackSearchAuthorityPublication(
  bucket: SearchAuthorityPublicationBucket,
  input: { hostname: string, targetManifestVersion: string, rolledBackAt: string }
): Promise<SearchAuthorityPublicationManifest> {
  const hostname = safeHostname(input.hostname)
  if (!/^[a-z0-9-]{10,100}$/.test(input.targetManifestVersion)) {
    throw new Error('Target manifest version is invalid')
  }
  const target = await readManifest(bucket, manifestKey(hostname, input.targetManifestVersion))
  if (!target || target.hostname !== hostname || target.manifestVersion !== input.targetManifestVersion) {
    throw new Error('Verified rollback manifest not found')
  }
  for (const route of Object.values(target.routes)) {
    if (!route.key.startsWith(`hosts/${hostname}/versions/`) || !await bucket.head(route.key)) {
      throw new Error('Rollback manifest references unavailable content')
    }
  }
  const restored = { ...target, activatedAt: input.rolledBackAt, rolledBackAt: input.rolledBackAt }
  await putCurrentManifest(bucket, hostname, restored)
  return restored
}

export async function getCurrentSearchAuthorityManifest(
  bucket: SearchAuthorityPublicationBucket,
  hostname: string
): Promise<SearchAuthorityPublicationManifest | null> {
  return readManifest(bucket, currentManifestKey(safeHostname(hostname)))
}

export async function restoreSearchAuthorityPublicationPointer(
  bucket: SearchAuthorityPublicationBucket,
  input: { hostname: string, targetManifestVersion: string | null, restoredAt: string }
): Promise<void> {
  const hostname = safeHostname(input.hostname)
  if (!input.targetManifestVersion) {
    await bucket.delete(currentManifestKey(hostname))
    return
  }
  await rollbackSearchAuthorityPublication(bucket, {
    hostname,
    targetManifestVersion: input.targetManifestVersion,
    rolledBackAt: input.restoredAt
  })
}

export function resolveSearchAuthorityPublicationBucket(
  event: H3Event
): SearchAuthorityPublicationBucket | null {
  const direct = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env?.SEARCH_AUTHORITY_BUCKET
  if (direct && typeof direct === 'object') return direct as SearchAuthorityPublicationBucket
  return getCachedObjectBinding<SearchAuthorityPublicationBucket>('SEARCH_AUTHORITY_BUCKET') ?? null
}

async function putImmutable(
  bucket: SearchAuthorityPublicationBucket,
  key: string,
  body: string,
  contentType: string,
  contentHash: string
): Promise<void> {
  const existing = await bucket.head(key)
  if (existing) {
    if (existing.customMetadata?.contentHash !== contentHash) {
      throw new Error(`Immutable publication object could not be verified: ${key}`)
    }
    return
  }
  const stored = await bucket.put(key, body, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { contentHash }
  })
  if (stored === null || !await bucket.head(key)) {
    throw new Error(`Publication object write could not be verified: ${key}`)
  }
}

async function putCurrentManifest(
  bucket: SearchAuthorityPublicationBucket,
  hostname: string,
  manifest: SearchAuthorityPublicationManifest
): Promise<void> {
  const stored = await bucket.put(currentManifestKey(hostname), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
    customMetadata: { manifestVersion: manifest.manifestVersion }
  })
  if (stored === null) throw new Error('Current publication manifest write was rejected')
}

async function readManifest(
  bucket: SearchAuthorityPublicationBucket,
  key: string
): Promise<SearchAuthorityPublicationManifest | null> {
  const object = await bucket.get(key)
  if (!object) return null
  const parsed: unknown = JSON.parse(await object.text())
  if (!isManifest(parsed)) return null
  return parsed
}

function isManifest(value: unknown): value is SearchAuthorityPublicationManifest {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.schemaVersion === 1
    && typeof record.hostname === 'string'
    && typeof record.manifestVersion === 'string'
    && typeof record.routes === 'object'
    && record.routes !== null
    && typeof record.redirects === 'object'
    && record.redirects !== null
}

function currentManifestKey(hostname: string): string {
  return `hosts/${hostname}/manifests/current.json`
}

function manifestKey(hostname: string, version: string): string {
  return `hosts/${hostname}/manifests/${version}.json`
}

function safeHostname(value: string): string {
  const hostname = value.trim().toLowerCase()
  if (!HOSTNAME.test(hostname)) throw new Error('Publication hostname is invalid')
  return hostname
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
