export interface OfficialDocumentationResult {
  provider: string
  requestedUrl: string
  url: string | null
  title: string | null
  status: 'readable' | 'unavailable' | 'empty' | 'too_large' | 'unsupported_content' | 'blocked'
  fetchedAt: string
  contentDigest: string | null
  excerpt: string
  httpStatus: number | null
  reason?: string
}
