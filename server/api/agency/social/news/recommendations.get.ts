import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { nextOptimalSlots } from '~~/server/utils/socialSlots'

/** GET /api/agency/social/news/recommendations?clientId=&newsId=&platforms=... */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const query = getQuery(event)
  const clientId = String(query.clientId || '')
  const newsId = String(query.newsId || '')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const requested = String(query.platforms || '').split(',').map(value => value.trim()).filter(Boolean)
  const [profile, accounts, performance, news] = await Promise.all([
    queryOne<{ preferred_platforms: string[] | null; target_audience: string | null; timezone: string | null; include_keywords: string[] | null; exclude_keywords: string[] | null }>(
      `SELECT preferred_platforms, target_audience, timezone FROM social_news_client_profiles WHERE client_id = $1`, [clientId]),
    queryRows<{ id: string; platform: string; account_name: string | null; last_error: string | null; token_expires_at: string | null }>(
      `SELECT id, platform, account_name, last_error, token_expires_at FROM social_accounts WHERE client_id = $1 AND is_active = TRUE ORDER BY platform, account_name`, [clientId]),
    queryRows<{ platform: string; impressions: number; engagements: number }>(
      `SELECT m.platform, COALESCE(SUM(m.impressions), 0)::int AS impressions, COALESCE(SUM(m.engagements), 0)::int AS engagements
         FROM social_post_metrics m JOIN social_posts p ON p.id = m.post_id
        WHERE p.client_id = $1 AND p.status IN ('published', 'partially_published')
        GROUP BY m.platform`, [clientId]),
    newsId ? queryOne<{ title: string; topics: string[] | null }>(
      `SELECT title, topics FROM social_news_items WHERE id = $1`, [newsId]) : Promise.resolve(null),
  ])
  const available = [...new Set(accounts.map(account => account.platform))]
  const preferred = (profile?.preferred_platforms || []).filter(platform => available.includes(platform))
  const metrics = new Map(performance.map(row => [row.platform, row]))
  const score = (platform: string) => {
    const row = metrics.get(platform)
    const impressions = Number(row?.impressions || 0)
    const engagements = Number(row?.engagements || 0)
    return impressions > 0 ? engagements / impressions : engagements
  }
  const ranked = (requested.length ? requested : preferred.length ? preferred : available)
    .filter(platform => available.includes(platform))
    .sort((a, b) => score(b) - score(a))
  const platforms = [...new Set(ranked)]
  const slots = await nextOptimalSlots(clientId, 1, new Date(), platforms)
  const articleText = `${news?.title || ''} ${(news?.topics || []).join(' ')}`.toLowerCase()
  const included = (profile?.include_keywords || []).filter(keyword => articleText.includes(keyword.toLowerCase()))
  const excluded = (profile?.exclude_keywords || []).filter(keyword => articleText.includes(keyword.toLowerCase()))
  return {
    clientId,
    audience: profile?.target_audience || null,
    timezone: profile?.timezone || 'Australia/Melbourne',
    platforms,
    accounts: accounts.filter(account => platforms.includes(account.platform)).map(account => ({
      id: account.id, platform: account.platform, accountName: account.account_name,
      health: account.last_error ? 'error' : account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now() ? 'expired' : 'ready',
      lastError: account.last_error,
    })),
    nextSlot: slots[0]?.toISOString() || null,
    article: news ? { title: news.title, relevant: included.length > 0 && excluded.length === 0, matchedKeywords: included, excludedKeywords: excluded } : null,
    basis: performance.length ? 'client profile and published engagement rate history' : 'client profile and connected accounts',
    approvalRequired: true,
  }
})
