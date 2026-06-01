import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { upsertPostMetric, upsertAccountMetric } from '~~/server/utils/socialReporting/store'

/**
 * POST /api/cron/sync-social-metrics
 * Slice 3 (3a) organic metrics collector. Invoked by the `social-metrics-cron` companion Worker
 * (Cloudflare Pages has no scheduled() handler). For each active account whose provider supports
 * metric fetch: snapshots account-level metrics (followers/reach) for today, then re-polls per-post
 * lifetime insights for posts published in a trailing window. Latest-snapshot model — everything is
 * upserted (idempotent), so re-runs are safe. Dormant until a Meta account is connected.
 */
const TRAILING_DAYS = 90

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const accounts = await queryRows<any>(
    `SELECT id, client_id, platform, platform_account_id, access_token
       FROM social_accounts WHERE is_active = TRUE AND access_token IS NOT NULL`,
  )

  let accountsSynced = 0
  let postsSynced = 0

  for (const acct of accounts) {
    const provider = getProvider(acct.platform)
    if (!provider) continue

    // Posts published to this platform in the trailing window, with a captured platform post id.
    const posts = await queryRows<{ id: string; platform_results: any }>(
      `SELECT id, platform_results FROM social_posts
        WHERE client_id = $1 AND $2 = ANY(platforms)
          AND status IN ('published','partially_published')
          AND published_at > NOW() - MAKE_INTERVAL(days => $3)`,
      [acct.client_id, acct.platform, TRAILING_DAYS],
    )
    const targets = posts
      .map(p => ({ postId: p.id, platformPostId: String(p.platform_results?.[acct.platform]?.platformPostId ?? '') }))
      .filter(t => t.platformPostId)

    // Account-level snapshot (today).
    if (provider.fetchAccountMetrics) {
      try {
        const metric = await provider.fetchAccountMetrics({ accountId: acct.platform_account_id, accessToken: acct.access_token })
        await upsertAccountMetric({ execute }, {
          clientId: acct.client_id, accountId: acct.id, platform: acct.platform,
          snapshotDate: today, postsCount: targets.length, metric,
        })
        accountsSynced++
      } catch (e: any) {
        console.error('social-metrics: account fetch failed', { accountId: acct.id, platform: acct.platform, error: String(e?.message ?? e) })
      }
    }

    // Per-post metrics.
    if (provider.fetchPostMetrics && targets.length) {
      try {
        const metrics = await provider.fetchPostMetrics({ accountId: acct.platform_account_id, accessToken: acct.access_token, posts: targets })
        for (const m of metrics) { await upsertPostMetric({ execute }, acct.platform, m); postsSynced++ }
      } catch (e: any) {
        console.error('social-metrics: post fetch failed', { accountId: acct.id, platform: acct.platform, error: String(e?.message ?? e) })
      }
    }
  }

  return { ok: true, accountsSynced, postsSynced }
})
