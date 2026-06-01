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

import { queryOne, execute } from './db'

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
  await execute(
    `UPDATE spend_sync_jobs
       SET status = 'completed',
           synced_count = $2,
           total_spend = $3,
           failures = $4::jsonb,
           finished_at = NOW()
     WHERE id = $1`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(result.failures || [])]
  )
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
  await execute(
    `UPDATE spend_sync_jobs
       SET processed_accounts = processed_accounts + 1,
           synced_count = synced_count + $2,
           total_spend = total_spend + $3,
           failures = failures || $4::jsonb,
           status = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                         THEN 'completed' ELSE status END,
           finished_at = CASE WHEN total_accounts IS NOT NULL AND processed_accounts + 1 >= total_accounts
                              THEN NOW() ELSE finished_at END
     WHERE id = $1`,
    [jobId, result.synced, result.totalSpend, JSON.stringify(result.failures || [])]
  )
}

/** Mark a job failed with an error message. */
export async function failSpendSyncJob(jobId: string, error: string): Promise<void> {
  await execute(
    `UPDATE spend_sync_jobs
       SET status = 'failed', error = $2, finished_at = NOW()
     WHERE id = $1`,
    [jobId, (error || 'Unknown error').slice(0, 1000)]
  )
}
