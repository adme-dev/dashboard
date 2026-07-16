import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { nextOptimalSlots } from '~~/server/utils/socialSlots'

/** GET /api/agency/social/news/recommendations?clientId=&platforms=... */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const query = getQuery(event)
  const clientId = String(query.clientId || '')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const requested = String(query.platforms || '').split(',').map(value => value.trim()).filter(Boolean)
  const [profile, accounts, performance] = await Promise.all([
    queryOne<{ preferred_platforms: string[] | null; target_audience: string | null; timezone: string | null }>(
      `SELECT preferred_platforms, target_audience, timezone FROM social_news_client_profiles WHERE client_id = $1`, [clientId]),
    queryRows<{ id: string; platform: string; account_name: string | null }>(
      `SELECT id, platform, account_name FROM social_accounts WHERE client_id = $1 AND is_active = TRUE ORDER BY platform, account_name`, [clientId]),
    queryRows<{ platform: string; impressions: number; engagements: number }>(
      `SELECT m.platform, COALESCE(SUM(m.impressions), 0)::int AS impressions, COALESCE(SUM(m.engagements), 0)::int AS engagements
         FROM social_post_metrics m JOIN social_posts p ON p.id = m.post_id
        WHERE p.client_id = $1 AND p.status IN ('published', 'partially_published')
        GROUP BY m.platform`, [clientId]),
  ])
  const available = [...new Set(accounts.map(account => account.platform))]
  const preferred = (profile?.preferred_platforms || []).filter(platform => available.includes(platform))
  const metrics = new Map(performance.map(row => [row.platform, row]))
  const ranked = (requested.length ? requested : preferred.length ? preferred : available)
    .filter(platform => available.includes(platform))
    .sort((a, b) => (Number(metrics.get(b)?.engagements || 0) - Number(metrics.get(a)?.engagements || 0)))
  const platforms = [...new Set(ranked)]
  const slots = await nextOptimalSlots(clientId, 1, new Date(), platforms)
  return {
    clientId,
    audience: profile?.target_audience || null,
    timezone: profile?.timezone || 'Australia/Melbourne',
    platforms,
    accounts: accounts.filter(account => platforms.includes(account.platform)),
    nextSlot: slots[0]?.toISOString() || null,
    basis: performance.length ? 'client profile and published engagement history' : 'client profile and connected accounts',
    approvalRequired: true,
  }
})
