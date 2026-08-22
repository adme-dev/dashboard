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
  sanitizeSpendSyncFailures
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
        oldestSyncedAt: row?.oldest_synced_at ?? null
      }
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
        previousFinishedAt: previous?.finished_at ?? null
      }
    })
  } catch (error) {
    console.error('[SpendSync] failed to create coverage-drop owner notification:', error)
  }
}

// ─── G-2: coverage-delta gate (pre-persist) ─────────────────────────────────
// 19 Aug incident: a Meta resync moved campaign coverage 70→88 — 18 campaigns
// (including the 3 largest spenders) had been silently missing, and nothing
// flagged because every present row was fresh. The gate compares each source's
// RETURNED row count against its previous successful run BEFORE persisting:
// any decrease is a warning; a decrease beyond the halt threshold refuses the
// persist step entirely so a shrunken result set can never overwrite state.

export const SPEND_SYNC_COVERAGE_HALT_PCT = 5

export interface SpendCoverageGate {
  previousCount: number | null
  currentCount: number
  delta: number | null
  deltaPct: number | null
  action: 'proceed' | 'warn' | 'halt'
}

/** Pure threshold logic. No previous baseline (or a zero one) always proceeds. */
export function evaluateSpendCoverageGate(previousCount: number | null, currentCount: number): SpendCoverageGate {
  if (previousCount == null || previousCount <= 0) {
    return { previousCount: previousCount ?? null, currentCount, delta: null, deltaPct: null, action: 'proceed' }
  }
  const delta = currentCount - previousCount
  const deltaPct = Math.round((delta / previousCount) * 10_000) / 100
  if (delta >= 0) return { previousCount, currentCount, delta, deltaPct, action: 'proceed' }
  return {
    previousCount,
    currentCount,
    delta,
    deltaPct,
    action: -deltaPct > SPEND_SYNC_COVERAGE_HALT_PCT ? 'halt' : 'warn'
  }
}

export async function getLastSourceCampaignCount(platform: string, sourceKey: string): Promise<number | null> {
  const row = await queryOne<{ campaign_count: number }>(
    `SELECT campaign_count FROM spend_sync_source_counts WHERE platform = $1 AND source_key = $2`,
    [platform, sourceKey]
  ).catch(() => null)
  return row ? Number(row.campaign_count) : null
}

export async function recordSourceCampaignCount(
  platform: string,
  sourceKey: string,
  period: string,
  campaignCount: number
): Promise<void> {
  await execute(
    `INSERT INTO spend_sync_source_counts (platform, source_key, period, campaign_count, recorded_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (platform, source_key)
     DO UPDATE SET period = $3, campaign_count = $4, recorded_at = NOW()`,
    [platform, sourceKey, period, campaignCount]
  ).catch(error => console.error('[SpendSync] failed to record source campaign count:', error))
}

export interface SpendCoverageGateDeps {
  loadPrevious?: typeof getLastSourceCampaignCount
  notifyHalt?: (input: { platform: string, sourceLabel: string, gate: SpendCoverageGate }) => Promise<void>
}

async function notifyCoverageHalt(input: { platform: string, sourceLabel: string, gate: SpendCoverageGate }): Promise<void> {
  const ownerIds = await activeOwnerIds()
  try {
    const { createBulkNotifications } = await import('./notifications')
    await createBulkNotifications(ownerIds, {
      type: 'system',
      title: `${input.platform} spend sync halted: coverage dropped >${SPEND_SYNC_COVERAGE_HALT_PCT}%`,
      message: `${input.sourceLabel} returned ${input.gate.currentCount} campaigns against ${input.gate.previousCount} on the previous successful run (${input.gate.deltaPct}%). The persist step was HALTED — no rows were overwritten from the shrunken set. Investigate missing campaigns before re-running.`,
      link: '/agency/social',
      reason: 'direct',
      metadata: {
        kind: 'spend_sync_coverage_halt',
        platform: input.platform,
        source: input.sourceLabel,
        previousCount: input.gate.previousCount,
        currentCount: input.gate.currentCount,
        deltaPct: input.gate.deltaPct
      }
    })
  } catch (error) {
    console.error('[SpendSync] failed to create coverage-halt owner notification:', error)
  }
}

/**
 * Evaluate the coverage gate for one source BEFORE its persist step. On halt, records an owner alert
 * and returns halted:true — the caller must skip persisting and report the structured failure. On
 * warn/proceed the caller persists as normal and then records the new baseline count.
 */
export async function applySpendCoverageGate(
  input: { platform: string, sourceKey: string, sourceLabel: string, currentCount: number },
  deps: SpendCoverageGateDeps = {}
): Promise<{ gate: SpendCoverageGate, halted: boolean, warning: string | null }> {
  const previous = await (deps.loadPrevious ?? getLastSourceCampaignCount)(input.platform, input.sourceKey)
  const gate = evaluateSpendCoverageGate(previous, input.currentCount)
  if (gate.action === 'halt') {
    console.error(
      `[SpendSync] HALT: ${input.platform} source ${input.sourceLabel} returned ${gate.currentCount} campaigns `
      + `vs ${gate.previousCount} previously (${gate.deltaPct}%) — persist step refused.`
    )
    await (deps.notifyHalt ?? notifyCoverageHalt)({ platform: input.platform, sourceLabel: input.sourceLabel, gate })
    return {
      gate,
      halted: true,
      warning: `Coverage halt: returned ${gate.currentCount} campaigns vs ${gate.previousCount} on the previous successful run (${gate.deltaPct}%); persist refused to protect existing rows`
    }
  }
  if (gate.action === 'warn') {
    const warning = `Coverage decreased: ${gate.currentCount} campaigns vs ${gate.previousCount} previously (${gate.deltaPct}%)`
    console.warn(`[SpendSync] ${input.platform} source ${input.sourceLabel}: ${warning}`)
    return { gate, halted: false, warning }
  }
  return { gate, halted: false, warning: null }
}

export interface SpendCoverageDelta {
  previousCount: number | null
  currentCount: number | null
  delta: number | null
  deltaPct: number | null
  previousFinishedAt: string | null
  currentFinishedAt: string | null
  /** True when the comparison run is too old to validate the current campaign universe. */
  staleBaseline: boolean
}

/**
 * Direction-of-travel coverage per platform from the last two completed sync jobs — surfaced as
 * `coverageDelta` beside `coverage` on the spend read tools. Null-safe: platforms without two
 * completed runs report null previous values rather than a fabricated zero.
 */
/** Same 48h window the read tools use for row freshness (responseContract.STALENESS_THRESHOLD_HOURS). */
export const COVERAGE_BASELINE_STALE_HOURS = 48

export async function getSpendCoverageDeltas(
  load: typeof queryRows = queryRows,
  now: Date = new Date()
): Promise<Record<string, SpendCoverageDelta> | null> {
  const rows = await load<{ platform: string, synced_count: number, finished_at: string | null, rank: number }>(
    `SELECT platform, synced_count, finished_at::text AS finished_at, rank FROM (
       SELECT platform, synced_count, finished_at,
              ROW_NUMBER() OVER (PARTITION BY platform ORDER BY finished_at DESC) AS rank
         FROM spend_sync_jobs
        WHERE status = 'completed' AND finished_at IS NOT NULL
     ) ranked
     WHERE rank <= 2`,
    []
  ).catch(() => null)
  if (!rows || rows.length === 0) return null
  const result: Record<string, SpendCoverageDelta> = {}
  for (const row of rows) {
    const platform = row.platform
    const entry = result[platform] ?? {
      previousCount: null, currentCount: null, delta: null, deltaPct: null,
      previousFinishedAt: null, currentFinishedAt: null,
      staleBaseline: false
    }
    if (Number(row.rank) === 1) {
      entry.currentCount = Number(row.synced_count)
      entry.currentFinishedAt = row.finished_at
    } else {
      entry.previousCount = Number(row.synced_count)
      entry.previousFinishedAt = row.finished_at
    }
    result[platform] = entry
  }
  for (const entry of Object.values(result)) {
    if (entry.currentCount != null && entry.previousCount != null) {
      entry.delta = entry.currentCount - entry.previousCount
      entry.deltaPct = entry.previousCount > 0
        ? Math.round(((entry.currentCount - entry.previousCount) / entry.previousCount) * 10_000) / 100
        : null
    }
    // Stale = the newest COMPLETED run is older than the staleness window relative to now (or absent).
    // Measured against now, not against the previous run: one fresh run after a months-old run is a
    // valid baseline (delta still compares against that old run and is reported honestly). The old
    // run-to-run gap rule meant a platform could never recover from an outage without two runs.
    const currentMs = entry.currentFinishedAt ? Date.parse(entry.currentFinishedAt) : Number.NaN
    entry.staleBaseline = !Number.isFinite(currentMs)
      || now.getTime() - currentMs > COVERAGE_BASELINE_STALE_HOURS * 3_600_000
  }
  return result
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

function hasCoverageFailure(failures: SyncFailure[]): boolean {
  return failures.some(failure => /coverage\s+(?:halt|failed|drop)/i.test(failure.reason))
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
  const coverageFailed = hasCoverageFailure(failures)
  const row = await queryOne<{ platform: string, period: string, status: string, synced_count: number, total_accounts: number | null }>(
    `UPDATE spend_sync_jobs
       SET status = CASE WHEN $5
                         THEN 'failed'
                         WHEN $2 = 0 AND jsonb_array_length($4::jsonb) > 0
                         THEN 'failed' ELSE 'completed' END,
           synced_count = $2,
           total_spend = $3,
           failures = $4::jsonb,
           coverage_failed = $5,
           error = CASE WHEN $5
                        THEN 'Sync coverage verification failed; results must not be treated as complete'
                        WHEN $2 = 0 AND jsonb_array_length($4::jsonb) > 0
                        THEN 'Sync finished with account failures and no campaigns updated'
                        ELSE error END,
           finished_at = NOW()
     WHERE id = $1
     RETURNING platform, period, status, synced_count, total_accounts`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(failures), coverageFailed]
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
  const coverageFailed = hasCoverageFailure(failures)
  const row = await queryOne<{ platform: string, period: string, status: string, synced_count: number, total_accounts: number | null }>(
    `UPDATE spend_sync_jobs
       SET processed_accounts = processed_accounts + 1,
           synced_count = synced_count + $2,
           total_spend = total_spend + $3,
           failures = failures || $4::jsonb,
           coverage_failed = coverage_failed OR $5,
           status = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              AND (coverage_failed OR $5)
                         THEN 'failed'
                         WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              AND synced_count + $2 = 0
                              AND jsonb_array_length(failures || $4::jsonb) > 0
                         THEN 'failed'
                         WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                         THEN 'completed'
                         ELSE status END,
           error = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                             AND (coverage_failed OR $5)
                        THEN 'Sync coverage verification failed; results must not be treated as complete'
                        WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                             AND synced_count + $2 = 0
                             AND jsonb_array_length(failures || $4::jsonb) > 0
                        THEN 'Sync finished with account failures and no campaigns updated'
                        ELSE error END,
           finished_at = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              THEN NOW() ELSE finished_at END
     WHERE id = $1
     RETURNING platform, period, status, synced_count, total_accounts`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(failures), coverageFailed]
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
/**
 * Terminalise jobs that have been `running` with no progress for longer than `maxAgeHours`.
 * A queue message lost, a worker killed, or an inline waitUntil cut off by Cloudflare's time
 * budget all leave a job `running` forever; get_sync_status would report it as in-flight
 * indefinitely. Called by the starter so a fresh run never sits behind a ghost. Returns the
 * ids it reaped.
 */
export async function reapOrphanedSpendSyncJobs(platform: string, maxAgeHours = 2, run: typeof queryRows = queryRows): Promise<string[]> {
  const rows = await run<{ id: string }>(
    `UPDATE spend_sync_jobs
        SET status = 'failed',
            error = 'Orphaned: no terminal update within ' || $2::text || 'h of start (worker killed, queue message lost, or inline sync cut off)',
            finished_at = NOW()
      WHERE platform = $1
        AND status = 'running'
        AND started_at < NOW() - ($2 * interval '1 hour')
      RETURNING id`,
    [platform, maxAgeHours]
  )
  return rows.map(r => r.id)
}

export async function failSpendSyncJob(jobId: string, error: string): Promise<void> {
  await execute(
    `UPDATE spend_sync_jobs
       SET status = 'failed', error = $2, finished_at = NOW()
     WHERE id = $1`,
    [jobId, sanitizeSpendSyncFailureReason(error)]
  )
}
