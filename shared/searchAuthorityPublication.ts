export interface SearchAuthorityPublicationRoute {
  key: string
  contentType: 'text/html; charset=utf-8' | 'application/xml; charset=utf-8' | 'text/plain; charset=utf-8'
  etag: string
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
}
