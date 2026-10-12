import { canonicalNewsUrl, DRIVEAGENT_NEWS_ORIGIN, eligiblePublishedStory } from '~~/server/utils/socialNewsAutopostPlan'

/** Recheck current publication immediately before dispatch, so withdrawals do not escape the queue. */
export async function verifyAutomaticNewsSource(post: { link_url: string | null, metadata?: Record<string, unknown> }, fetchImpl: typeof fetch = fetch): Promise<'ready' | 'withdrawn' | 'retry'> {
  if (post.metadata?.newsAutopostAutomatic !== true) return 'ready'
  const url = canonicalNewsUrl(post.link_url)
  if (!url) return 'withdrawn'
  const slug = new URL(url).pathname.slice('/news/'.length)
  try {
    const response = await fetchImpl(`${DRIVEAGENT_NEWS_ORIGIN}/api/news/articles/${slug}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
    if ([301, 308, 404, 410].includes(response.status)) return 'withdrawn'
    if (!response.ok) return 'retry'
    const text = await response.text()
    if (text.length > 150_000) return 'retry'
    const payload = JSON.parse(text) as Record<string, unknown>
    if (payload?.status === 'retracted') return 'withdrawn'
    if (payload?.status !== 'published' || typeof payload.id !== 'string' || typeof payload.slug !== 'string'
      || typeof payload.title !== 'string' || typeof payload.publishedAt !== 'string' || !Number.isFinite(Date.parse(payload.publishedAt))) return 'retry'
    const story = eligiblePublishedStory(payload, new Date())
    return story && story.id === post.metadata.articleId && story.url === url ? 'ready' : 'withdrawn'
  } catch { return 'retry' }
}
