import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { upsertPostMetric, upsertAccountMetric } from '~~/server/utils/socialReporting/store'
import { publishedTargetsForAccount, type PublishableAccount } from '~~/server/utils/socialPublishing'

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
}

interface MetricsSyncHealth {
  status: 'healthy' | 'warning' | 'critical'
  accountsEligible: number
  accountsSynced: number
  unsupportedProviders: number
  accountFailures: number
  postTargetsDiscovered: number
  postsSynced: number
  postFailures: number
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const accounts = await queryRows<MetricSyncAccount>(
    `SELECT id, client_id, platform, platform_account_id, access_token
       FROM social_accounts WHERE is_active = TRUE AND access_token IS NOT NULL`
  )

  let accountsSynced = 0
  let postsSynced = 0
  let unsupportedProviders = 0
  let accountFailures = 0
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

    // Account-level snapshot (today).
    if (provider.fetchAccountMetrics) {
      try {
        const metric = await provider.fetchAccountMetrics({ accountId: acct.platform_account_id, accessToken: acct.access_token })
        await upsertAccountMetric({ execute }, {
          clientId: acct.client_id, accountId: acct.id, platform: acct.platform,
          snapshotDate: today, postsCount: targets.length, metric
        })
        accountsSynced++
      } catch (e: unknown) {
        accountFailures++
        console.error('social-metrics: account fetch failed', { accountId: acct.id, platform: acct.platform, error: errorMessage(e) })
      }
    }

    // Per-post metrics.
    if (provider.fetchPostMetrics && targets.length) {
      try {
        const metrics = await provider.fetchPostMetrics({ accountId: acct.platform_account_id, accessToken: acct.access_token, posts: targets })
        for (const metric of metrics) {
          await upsertPostMetric({ execute }, acct.platform, metric)
          postsSynced++
        }
      } catch (e: unknown) {
        postFailures++
        console.error('social-metrics: post fetch failed', { accountId: acct.id, platform: acct.platform, error: errorMessage(e) })
      }
    }
  }

  const health = metricsSyncHealth({
    accountsEligible: accounts.length,
    accountsSynced,
    unsupportedProviders,
    accountFailures,
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
    : input.unsupportedProviders > 0 ? 'warning' : 'healthy'
  return { status, ...input }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
