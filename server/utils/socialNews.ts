export interface McpNewsItem {
  externalId: string
  title: string
  summary?: string | null
  url?: string | null
  author?: string | null
  publishedAt?: string | null
  raw?: Record<string, unknown>
}

/** Stable source identity used to deduplicate repeated MCP refreshes. */
export function normalizeMcpNewsItem(input: Record<string, unknown>): McpNewsItem | null {
  const url = typeof input.url === 'string' ? input.url : typeof input.link === 'string' ? input.link : null
  const id = typeof input.externalId === 'string' ? input.externalId
    : typeof input.id === 'string' ? input.id
      : typeof input.slug === 'string' ? input.slug : url
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!id || !title) return null
  return {
    externalId: id,
    title,
    summary: typeof input.summary === 'string' ? input.summary
      : typeof input.description === 'string' ? input.description
        : typeof input.snippet === 'string' ? input.snippet : null,
    url,
    author: typeof input.author === 'string' ? input.author : typeof input.source === 'string' ? input.source : null,
    publishedAt: typeof input.publishedAt === 'string' ? input.publishedAt
      : typeof input.published_at === 'string' ? input.published_at
        : typeof input.published === 'string' ? input.published : null,
    raw: input,
  }
}
