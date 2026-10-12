import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'
import { canonicalNewsUrl, DRIVEAGENT_NEWS_ORIGIN } from '~~/server/utils/socialNewsAutopostPlan'

export const NEWSROOM_OWNER = 'driveagent-newsroom'
export interface NewsroomConfig { secret: string, clientId: string, accountId: string }
export interface NewsroomPost {
  id: string
  client_id: string
  created_by?: string | null
  content: string
  link_url: string | null
  media_urls: string[] | null
  platforms: string[]
  account_ids: string[] | null
  publish_targets?: unknown
  platform_overrides?: unknown
  first_comment?: string | null
  scheduled_at?: string | Date | null
  status?: string
  publish_attempts?: number
  published_at?: string | Date | null
  platform_results?: Record<string, { status?: string, url?: string, error?: string | null }>
  metadata?: Record<string, unknown>
}

export function newsroomConfig(bindings?: Record<string, unknown>): NewsroomConfig {
  if (!bindings) {
    try {
      bindings = useEvent().context.cloudflare?.env
    } catch { /* local/test fallback */ }
  }
  const value = (key: string) => String(bindings?.[key] ?? process.env[key] ?? '')
  const secret = value('NEWSROOM_SOCIAL_SECRET')
  const clientId = value('NEWSROOM_SOCIAL_CLIENT_ID')
  const accountId = value('NEWSROOM_SOCIAL_ACCOUNT_ID')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (value('NEWSROOM_SOCIAL_ENABLED') !== 'true' || secret.length < 32 || !uuid.test(clientId) || !uuid.test(accountId)) {
    throw createError({ statusCode: 503, statusMessage: 'Newsroom social delivery unavailable' })
  }
  return { secret, clientId, accountId }
}

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function authorizeNewsroom(config: NewsroomConfig, token: string | undefined): void {
  if (!token || !equalSecret(token, config.secret)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}

export function isNewsroomOwned(post: Pick<NewsroomPost, 'created_by' | 'metadata'>): boolean {
  return post.created_by === NEWSROOM_OWNER || post.metadata?.source === NEWSROOM_OWNER
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, stable(val)]))
  return value
}
export function signNewsroomPost(post: NewsroomPost, secret: string): string {
  const metadata = { ...post.metadata }
  delete metadata.signature
  const approval = {
    id: post.id, clientId: post.client_id, owner: post.created_by, content: post.content,
    link: post.link_url, media: post.media_urls ?? [], platforms: post.platforms,
    accounts: post.account_ids ?? [], targets: post.publish_targets ?? [], overrides: post.platform_overrides ?? {},
    firstComment: post.first_comment ?? null,
    scheduledAt: post.scheduled_at ? new Date(post.scheduled_at).toISOString() : null,
    metadata
  }
  return createHmac('sha256', secret).update(JSON.stringify(stable(approval))).digest('hex')
}

/** No arbitrary URLs or redirects; failures require a fresh newsroom approval. */
export async function verifyNewsroomSource(post: NewsroomPost, config?: NewsroomConfig, fetchImpl: typeof fetch = fetch): Promise<'ready' | 'blocked'> {
  if (!isNewsroomOwned(post)) return 'ready'
  try {
    const target = config ?? newsroomConfig()
    if (post.created_by !== NEWSROOM_OWNER || post.metadata?.source !== NEWSROOM_OWNER
      || post.client_id !== target.clientId || post.account_ids?.length !== 1 || post.account_ids[0] !== target.accountId
      || typeof post.metadata.signature !== 'string' || !equalSecret(post.metadata.signature, signNewsroomPost(post, target.secret))) return 'blocked'
    const link = canonicalNewsUrl(post.link_url)
    if (!link || link !== post.link_url) return 'blocked'
    const slug = new URL(link).pathname.slice('/news/'.length)
    const response = await fetchImpl(`${DRIVEAGENT_NEWS_ORIGIN}/api/news/articles/${slug}`, {
      redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }, cache: 'no-store'
    })
    if (!response.ok) return 'blocked'
    const text = await response.text()
    if (text.length > 150_000) return 'blocked'
    const article = JSON.parse(text)
    if (article.category === 'Supercars' && article.socialDistributionEligible !== true) return 'blocked'
    return article.id === post.metadata.articleId && article.slug === slug && article.status === 'published'
      && typeof article.updatedAt === 'string' && article.updatedAt === post.metadata.articleUpdatedAt
      ? 'ready'
      : 'blocked'
  } catch { return 'blocked' }
}
