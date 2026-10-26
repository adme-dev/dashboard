import { requireSocialCronAuth } from '~~/server/utils/socialPublishing/cronAuth'
import { defineEventHandler } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { upsertPostMetric, upsertAccountMetric } from '~~/server/utils/socialReporting/store'
import { publishedTargetsForAccount, type PublishableAccount } from '~~/server/utils/socialPublishing'
import { resolveSocialAccountAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'

/**
 * POST /api/cron/sync-social-metrics
 * Slice 3 (3a) organic metrics collector. Invoked by the `social-metrics-cron` companion Worker
 * (Cloudflare Pages has no scheduled() handler). For each active account whose provider supports
 * metric fetch: snapshots account-level metrics (followers/reach) for today, then re-polls per-post
 * lifetime insights for posts published in a trailing window. Latest-snapshot model — everything is
 * upserted (idempotent), so re-runs are safe. Dormant until a Meta account is connected.
 */
const TRAILING_DAYS = 90

interface MetricSyncAccount extends Pick<PublishableAccount, 'id' | 'platform' | 'platform_account_id' | 'access_token'> {
  client_id: string
  refresh_token?: string | null
  token_expires_at?: string | null
}

/** Platforms whose short-lived tokens must be refreshed before metric calls. */
const REFRESH_BEFORE_METRICS = new Set(['linkedin'])

interface MetricsSyncHealth {
  status: 'healthy' | 'warning' | 'critical'
  accountsEligible: number
  accountsSynced: number
  unsupportedProviders: number
  accountFailures: number
  /** Accounts synced with some metrics unavailable (left NULL rather than zeroed). */
  accountPartialFailures: number
  postTargetsDiscovered: number
  postsSynced: number
  postFailures: number
}

export default defineEventHandler(async (event) => {
  requireSocialCronAuth(event)

  const today = new Date().toISOString().slice(0, 10)
  const accounts = await queryRows<MetricSyncAccount>(
    `SELECT id, client_id, platform, platform_account_id, access_token, refresh_token, token_expires_at
       FROM social_accounts WHERE is_active = TRUE AND access_token IS NOT NULL`
  )

  let accountsSynced = 0
  let postsSynced = 0
  let unsupportedProviders = 0
  let accountFailures = 0
  let accountPartialFailures = 0
  let postTargetsDiscovered = 0
  let postFailures = 0

  for (const acct of accounts) {
    const provider = getProvider(acct.platform)
    if (!provider) {
      unsupportedProviders++
      continue
    }

    // Posts published to this platform in the trailing window, with a captured platform post id.
    const posts = await queryRows<{ id: string, platform_results: Record<string, unknown> | null }>(
      `SELECT id, platform_results FROM social_posts
        WHERE client_id = $1 AND $2 = ANY(platforms)
          AND status IN ('published','partially_published')
          AND published_at > NOW() - MAKE_INTERVAL(days => $3)`,
      [acct.client_id, acct.platform, TRAILING_DAYS]
    )
    const targets = posts.flatMap(p => publishedTargetsForAccount(p.id, p.platform_results, acct))
    postTargetsDiscovered += targets.length

    let accessToken = acct.access_token
    if (REFRESH_BEFORE_METRICS.has(acct.platform) && acct.refresh_token) {
      try {
        accessToken = await resolveSocialAccountAccessToken({
          event,
          db: { execute, queryOne },
          account: {
            id: acct.id,
            platform: acct.platform,
            access_token: acct.access_token,
            refresh_token: acct.refresh_token,
            token_expires_at: acct.token_expires_at ?? null
          }
        })
      } catch (e: unknown) {
        accountFailures++
        postFailures += targets.length
        console.error('social-metrics: token refresh failed', { accountId: acct.id, platform: acct.platform, error: errorMessage(e) })
        continue
      }
    }

    // Account-level snapshot (today).
    if (provider.fetchAccountMetrics) {
      try {
        const metric = await provider.fetchAccountMetrics({ accountId: acct.platform_account_id, accessToken })
        await upsertAccountMetric({ execute }, {
          clientId: acct.client_id, accountId: acct.id, platform: acct.platform,
          snapshotDate: today, postsCount: targets.length, metric
        })
        accountsSynced++
        if (metric.partialFailures?.length) {
          accountPartialFailures++
          console.warn('social-metrics: account metrics partially unavailable', { accountId: acct.id, platform: acct.platform, failures: metric.partialFailures })
        }
      } catch (e: unknown) {
        accountFailures++
        console.error('social-metrics: account fetch failed', { accountId: acct.id, platform: acct.platform, error: errorMessage(e) })
      }
    }

    // Per-post metrics.
    if (provider.fetchPostMetrics && targets.length) {
      const pending = new Set(targets.map(target => JSON.stringify([target.postId, target.platformPostId])))
      try {
        const metrics = await provider.fetchPostMetrics({ accountId: acct.platform_account_id, accessToken, posts: targets })
        for (const metric of metrics) {
          const key = JSON.stringify([metric.postId, metric.platformPostId])
          if (!pending.has(key)) continue
          await upsertPostMetric({ execute }, acct.platform, metric)
          pending.delete(key)
          postsSynced++
        }
      } catch (e: unknown) {
        console.error('social-metrics: post fetch failed', { accountId: acct.id, platform: acct.platform, error: errorMessage(e) })
      }
      postFailures += pending.size
    }
  }

  const health = metricsSyncHealth({
    accountsEligible: accounts.length,
    accountsSynced,
    unsupportedProviders,
    accountFailures,
    accountPartialFailures,
    postTargetsDiscovered,
    postsSynced,
    postFailures
  })
  if (health.status !== 'healthy') console.warn('social-metrics.health', health)

  return { ok: true, accountsSynced, postsSynced, health }
})

function metricsSyncHealth(input: Omit<MetricsSyncHealth, 'status'>): MetricsSyncHealth {
  const status: MetricsSyncHealth['status'] = input.accountFailures > 0 || input.postFailures > 0
    ? 'critical'
    : input.unsupportedProviders > 0 || input.accountPartialFailures > 0 ? 'warning' : 'healthy'
  return { status, ...input }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
