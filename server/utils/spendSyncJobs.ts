/**
 * Spend-sync job tracking.
 *
 * The /api/agency/social/<platform>/sync-spend endpoints run their work in the
 * background via waitUntil and return immediately, so the UI has no way to know
 * when a sync actually finishes. These helpers persist a job row (see migration
 * 125) that the background promise updates on completion, and that the frontend
 * polls via /api/agency/social/spend/sync-status to refresh its content and
 * surface per-account failures.
 */

import { queryOne, queryRows, execute } from './db'
import {
  sanitizeSpendSyncFailureReason,
  sanitizeSpendSyncFailures,
} from './spendSyncFailureSanitizer'

async function activeOwnerIds(): Promise<string[]> {
  const owners = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE is_active = TRUE AND user_role = 'owner'`
  ).catch(() => [])
  return owners.map(owner => owner.id)
}

/**
 * Fail loud when a sync job finishes with 0 synced across N accounts. That is
 * almost never a genuine $0 — it signals an empty-throttle / access-tier /
 * egress block (e.g. the Meta Marketing API `development_access` tier returns
 * empty insights, HTTP 200, to data-center egress IPs like Cloudflare's, while
 * the identical call from a residential IP returns real spend).
 *
 * Always logs. Additionally posts to Slack when SPEND_SYNC_ALERT_SLACK_WEBHOOK
 * is configured — dormant (log-only) otherwise, so it's safe to ship unset.
 */
async function alertEmptySpendSync(platform: string, jobId: string, totalAccounts: number): Promise<void> {
  console.error(
    `[SpendSync] ⚠️ ${platform} job ${jobId} COMPLETED with synced_count=0 across ${totalAccounts} accounts — `
    + `likely an access-tier/egress empty-throttle, NOT a genuine $0. Investigate before trusting the data.`
  )
  const webhook = process.env.SPEND_SYNC_ALERT_SLACK_WEBHOOK
  if (!webhook) return
  try {
    const { postSlack, validateWebhook } = await import('./anomalyDetection/slackBudget')
    if (!validateWebhook(webhook)) return
    await postSlack(webhook, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `:warning: *${platform} spend sync wrote $0*\n`
            + `Job \`${jobId}\` completed with *0 synced* across *${totalAccounts}* account(s).\n`
            + `Likely an access-tier/egress empty-throttle (e.g. Meta \`development_access\` from data-center IPs), not a real $0 — investigate before trusting the data.`
        }
      }
    ])
  } catch (e) {
    console.error('[SpendSync] failed to post $0-sync Slack alert:', e)
  }
}

/**
 * Emit one actionable owner alert after a completed platform job when current-
 * period rows remain outside the 48-hour freshness SLO. This is deliberately
 * aggregated per job so an account-wide Meta failure cannot create dozens of
 * duplicate campaign notifications.
 */
async function alertStaleSpendSync(platform: string, period: string, jobId: string): Promise<void> {
  const row = await queryOne<{ stale_rows: number, total_rows: number, oldest_synced_at: string | null }>(
    `SELECT COUNT(*)::int AS total_rows,
            COUNT(*) FILTER (WHERE synced_at IS NULL OR synced_at < now() - interval '48 hours')::int AS stale_rows,
            MIN(synced_at)::text AS oldest_synced_at
       FROM media_spend
      WHERE platform = $1 AND period = $2`,
    [platform === 'google' ? 'google_ads' : platform, period]
  ).catch(() => null)
  const staleRows = Number(row?.stale_rows || 0)
  if (staleRows <= 0) return

  console.error(`[SpendSync] ${platform} job ${jobId} left ${staleRows}/${Number(row?.total_rows || 0)} current-period campaign rows stale.`)
  const ownerIds = await activeOwnerIds()
  try {
    const { createBulkNotifications } = await import('./notifications')
    await createBulkNotifications(ownerIds, {
      type: 'system',
      title: `${platform === 'meta' ? 'Meta' : 'Google'} campaign sync is stale`,
      message: `${staleRows} of ${Number(row?.total_rows || 0)} campaign rows remain older than 48 hours after the latest sync. Do not rely on campaign figures until the provider sync recovers.`,
      link: '/agency/social',
      reason: 'direct',
      metadata: {
        kind: 'spend_sync_stale',
        platform,
        period,
        jobId,
        staleRowCount: staleRows,
        oldestSyncedAt: row?.oldest_synced_at ?? null,
      },
    })
  } catch (error) {
    console.error('[SpendSync] failed to create stale-sync owner notification:', error)
  }
}

/**
 * Compare the just-finished job with the immediately previous successful run. A lower campaign
 * count is a coverage regression even when every returned row is fresh, so it must not hide behind
 * the freshness SLO.
 */
async function alertSpendSyncCoverageDrop(
  platform: string,
  period: string,
  jobId: string,
  currentCampaignCount: number
): Promise<void> {
  const previous = await queryOne<{ synced_count: number, finished_at: string | null }>(
    `SELECT synced_count, finished_at::text AS finished_at
       FROM spend_sync_jobs
      WHERE id <> $1
        AND platform = $2
        AND status = 'completed'
        AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1`,
    [jobId, platform]
  ).catch(() => null)
  const previousCampaignCount = Number(previous?.synced_count ?? 0)
  if (previousCampaignCount <= 0 || currentCampaignCount >= previousCampaignCount) return

  const missingCampaignCount = previousCampaignCount - currentCampaignCount
  console.error(
    `[SpendSync] ${platform} job ${jobId} covered ${currentCampaignCount} campaigns, `
    + `down ${missingCampaignCount} from the previous run (${previousCampaignCount}).`
  )
  const ownerIds = await activeOwnerIds()
  try {
    const { createBulkNotifications } = await import('./notifications')
    const platformLabel = platform === 'meta' ? 'Meta' : platform === 'google' ? 'Google' : platform
    await createBulkNotifications(ownerIds, {
      type: 'system',
      title: `${platformLabel} campaign coverage dropped`,
      message: `The latest ${platformLabel} sync returned ${currentCampaignCount} campaigns, ${missingCampaignCount} fewer than the previous successful run (${previousCampaignCount}). Freshness alone is not sufficient; investigate missing accounts or campaigns before relying on portfolio rankings.`,
      link: '/agency/social',
      reason: 'direct',
      metadata: {
        kind: 'spend_sync_coverage_drop',
        platform,
        period,
        jobId,
        previousCampaignCount,
        currentCampaignCount,
        missingCampaignCount,
        previousFinishedAt: previous?.finished_at ?? null,
      },
    })
  } catch (error) {
    console.error('[SpendSync] failed to create coverage-drop owner notification:', error)
  }
}

export interface SyncFailure {
  account: string
  reason: string
}

export interface SyncJobResult {
  synced: number
  totalSpend: number
  failures?: SyncFailure[]
}

/** Create a 'running' job row and return its id. Call synchronously before kicking off the background sync. */
export async function createSpendSyncJob(
  platform: string,
  period: string,
  startedBy: string | null
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO spend_sync_jobs (platform, period, status, started_by)
     VALUES ($1, $2, 'running', $3)
     RETURNING id`,
    [platform, period, startedBy]
  )
  return row!.id
}

/** Mark a job completed with its result. Safe to call from inside a waitUntil promise. */
export async function completeSpendSyncJob(jobId: string, result: SyncJobResult): Promise<void> {
  const failures = sanitizeSpendSyncFailures(result.failures)
  const row = await queryOne<{ platform: string, period: string, status: string, synced_count: number, total_accounts: number | null }>(
    `UPDATE spend_sync_jobs
       SET status = CASE WHEN $2 = 0 AND jsonb_array_length($4::jsonb) > 0
                         THEN 'failed' ELSE 'completed' END,
           synced_count = $2,
           total_spend = $3,
           failures = $4::jsonb,
           error = CASE WHEN $2 = 0 AND jsonb_array_length($4::jsonb) > 0
                        THEN 'Sync finished with account failures and no campaigns updated'
                        ELSE error END,
           finished_at = NOW()
     WHERE id = $1
     RETURNING platform, period, status, synced_count, total_accounts`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(failures)]
  )
  if (row && Number(result.synced) === 0 && Number(row.total_accounts) > 0) {
    await alertEmptySpendSync(row.platform, jobId, Number(row.total_accounts))
  }
  if (row?.period) {
    await alertSpendSyncCoverageDrop(row.platform, row.period, jobId, Number(row.synced_count))
    await alertStaleSpendSync(row.platform, row.period, jobId)
  }
}

/** Record how many accounts this job fanned out to (per-account chunking). */
export async function setSyncJobTotalAccounts(jobId: string, total: number): Promise<void> {
  await execute(
    `UPDATE spend_sync_jobs SET total_accounts = $2 WHERE id = $1`,
    [jobId, total]
  )
}

/**
 * Fan-in one account's result into the job. Atomic single UPDATE so concurrent
 * per-account consumer invocations don't race: increments processed_accounts,
 * accumulates synced/spend/failures, and flips status to 'completed' on the
 * UPDATE that reaches total_accounts.
 */
export async function recordSyncJobAccountResult(jobId: string, result: SyncJobResult): Promise<void> {
  const failures = sanitizeSpendSyncFailures(result.failures)
  const row = await queryOne<{ platform: string, period: string, status: string, synced_count: number, total_accounts: number | null }>(
    `UPDATE spend_sync_jobs
       SET processed_accounts = processed_accounts + 1,
           synced_count = synced_count + $2,
           total_spend = total_spend + $3,
           failures = failures || $4::jsonb,
           status = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              AND synced_count + $2 = 0
                              AND jsonb_array_length(failures || $4::jsonb) > 0
                         THEN 'failed'
                         WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                         THEN 'completed'
                         ELSE status END,
           error = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                             AND synced_count + $2 = 0
                             AND jsonb_array_length(failures || $4::jsonb) > 0
                        THEN 'Sync finished with account failures and no campaigns updated'
                        ELSE error END,
           finished_at = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              THEN NOW() ELSE finished_at END
     WHERE id = $1
     RETURNING platform, period, status, synced_count, total_accounts`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(failures)]
  )
  // Fail loud (+ Slack alert when configured): a job that completes with 0 synced
  // across N accounts is almost never a genuine $0 — see alertEmptySpendSync.
  if (row && row.status !== 'running' && Number(row.synced_count) === 0 && Number(row.total_accounts) > 0) {
    await alertEmptySpendSync(row.platform, jobId, Number(row.total_accounts))
  }
  if (row?.period && row.status !== 'running') {
    await alertSpendSyncCoverageDrop(row.platform, row.period, jobId, Number(row.synced_count))
    await alertStaleSpendSync(row.platform, row.period, jobId)
  }
}

/** Mark a job failed with an error message. */
export async function failSpendSyncJob(jobId: string, error: string): Promise<void> {
  await execute(
    `UPDATE spend_sync_jobs
       SET status = 'failed', error = $2, finished_at = NOW()
     WHERE id = $1`,
    [jobId, sanitizeSpendSyncFailureReason(error)]
  )
}
