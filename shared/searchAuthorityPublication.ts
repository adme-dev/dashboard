export interface SearchAuthorityPublicationRoute {
  key: string
  contentType: 'text/html; charset=utf-8' | 'application/xml; charset=utf-8' | 'text/plain; charset=utf-8'
  etag: string
}

export type SearchAuthorityPublishingMode = 'subdomain' | 'same_host'

/** One published guide as listed on the hub, sitemap and GTM feature block. */
export interface SearchAuthorityPublishedGuide {
  slug: string
  title: string
  excerpt: string
  publishedAt: string
}

export interface SearchAuthorityPublicationManifest {
  schemaVersion: 1
  hostname: string
  manifestVersion: string
  publicationId: string
  versionId: string
  activatedAt: string
  routes: Record<string, SearchAuthorityPublicationRoute>
  redirects: Record<string, string>
  rolledBackAt?: string
  /** Site public id — lets the publisher serve `/s/<publicId>/guides/*` for same-host rewrites. */
  publicId?: string
  mode?: SearchAuthorityPublishingMode
  /** Every guide currently routable on this host, newest first. */
  guides?: SearchAuthorityPublishedGuide[]
}

/** Stored at `aliases/<publicId>.json` so the publisher can resolve a same-host path to its hostname. */
export interface SearchAuthorityHostAlias {
  hostname: string
  mode: SearchAuthorityPublishingMode
}
