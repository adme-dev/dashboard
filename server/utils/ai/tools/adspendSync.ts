import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { aiInternalFetch } from '../internalFetch'
import type { AiTool } from '../toolRegistry'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const COOLDOWN_KEY = 'global'
export const ADSPEND_SYNC_COOLDOWN_MINUTES = 30

type Platform = 'meta' | 'google' | 'all'
type JobPlatform = Exclude<Platform, 'all'>

type StartedJob = {
  jobId: string
  status: string
  startedAt: string
  queued?: boolean
  accounts?: number
  reapedJobIds?: string[]
}

export type SpendSyncJobRow = {
  id: string
  platform: JobPlatform
  period: string
  status: 'running' | 'completed' | 'failed'
  synced_count: number
  failures: Array<{ account: string, reason: string }> | null
  error: string | null
  started_at: string
  finished_at: string | null
  total_accounts: number | null
  processed_accounts: number
  coverage_failed: boolean
}

export type AdspendSyncDeps = {
  reserveCooldown: (platform: Platform, userId: string) => Promise<{ accepted: boolean, nextAllowedAt: string }>
  /** Releases a reservation whose start never produced a job, so a failed start does not burn the cooldown. */
  releaseCooldown: (userId: string) => Promise<void>
  startPlatform: (platform: JobPlatform, ctx: ToolContext) => Promise<StartedJob>
  loadJobs: (ids: string[], userId: string) => Promise<SpendSyncJobRow[]>
  now: () => Date
}

async function reserveCooldown(platform: Platform, userId: string) {
  const accepted = await queryOne<{ next_allowed_at: string }>(
    `INSERT INTO mcp_adspend_sync_cooldown (key, next_allowed_at, requested_platform, started_by)
     VALUES ($1, NOW() + ($2 * interval '1 minute'), $3, $4::uuid)
     ON CONFLICT (key) DO UPDATE
       SET next_allowed_at = NOW() + ($2 * interval '1 minute'),
           requested_platform = $3,
           started_by = $4::uuid,
           updated_at = NOW()
       WHERE mcp_adspend_sync_cooldown.next_allowed_at <= NOW()
     RETURNING next_allowed_at::text`,
    [COOLDOWN_KEY, ADSPEND_SYNC_COOLDOWN_MINUTES, platform, userId]
  )
  if (accepted) return { accepted: true, nextAllowedAt: accepted.next_allowed_at }
  const existing = await queryOne<{ next_allowed_at: string }>(
    `SELECT next_allowed_at::text FROM mcp_adspend_sync_cooldown WHERE key = $1`,
    [COOLDOWN_KEY]
  )
  return { accepted: false, nextAllowedAt: existing?.next_allowed_at ?? new Date().toISOString() }
}

async function releaseCooldown(userId: string): Promise<void> {
  await queryOne(
    `UPDATE mcp_adspend_sync_cooldown
        SET next_allowed_at = NOW(), updated_at = NOW()
      WHERE key = $1 AND started_by = $2::uuid AND next_allowed_at > NOW()`,
    [COOLDOWN_KEY, userId]
  )
}

async function startPlatform(platform: JobPlatform, ctx: ToolContext): Promise<StartedJob> {
  // Kick off with the ORIGINATING request event so the JOBS_QUEUE binding is present. An internal
  // HTTP hop (aiInternalFetch → Nitro $fetch) builds a fresh event without Cloudflare bindings, the
  // endpoint falls to the inline waitUntil path, and Cloudflare cuts it off at ~100 accounts,
  // leaving the job 'running' forever (observed in prod 2026-08-22).
  if (ctx.event) {
    const { startSpendSyncPlatform } = await import('~~/server/utils/spendSyncKickoff')
    const now = new Date()
    return await startSpendSyncPlatform(ctx.event, platform, now.getMonth() + 1, now.getFullYear(), ctx.userId)
  }
  return await aiInternalFetch<StartedJob>(`/api/agency/social/${platform}/sync-spend`, { method: 'POST', body: {} }, ctx)
}

async function loadJobs(ids: string[], userId: string): Promise<SpendSyncJobRow[]> {
  return await queryRows<SpendSyncJobRow>(
    `SELECT id, platform, period, status, synced_count, failures, error,
            started_at::text, finished_at::text, total_accounts, processed_accounts,
            coverage_failed
       FROM spend_sync_jobs
      WHERE id = ANY($1::uuid[]) AND started_by = $2
      ORDER BY started_at`,
    [ids, userId]
  )
}

const defaultDeps: AdspendSyncDeps = { reserveCooldown, releaseCooldown, startPlatform, loadJobs, now: () => new Date() }
/** Test seam: the real startPlatform (event-bound kickoff), injectable alongside mocked DB deps. */
export const __startPlatformForTest = startPlatform

/** Turns a thrown fetch/H3 error into a one-line operator-readable reason (status + message + provider body when present). */
function describeError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err ?? 'Unknown error')
  const e = err as { statusCode?: number, status?: number, statusMessage?: string, message?: string, data?: unknown }
  const status = e.statusCode ?? e.status
  const parts: string[] = []
  if (status) parts.push(`HTTP ${status}`)
  const detail = typeof e.data === 'object' && e.data && 'statusMessage' in (e.data as object)
    ? String((e.data as { statusMessage?: unknown }).statusMessage)
    : typeof e.data === 'object' && e.data && 'message' in (e.data as object)
      ? String((e.data as { message?: unknown }).message)
      : null
  const message = e.statusMessage || e.message || null
  if (message) parts.push(message)
  if (detail && detail !== message) parts.push(detail)
  return parts.join(': ') || 'Unknown error'
}

function encodeHandle(ids: string[]): string {
  return `adspend-sync-v1:${ids.join(',')}`
}

function parseHandle(handle: string): string[] | null {
  const match = /^adspend-sync-v1:([0-9a-f-]+(?:,[0-9a-f-]+)?)$/i.exec(handle)
  if (!match) return null
  const ids = match[1]!.split(',')
  return ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    ? ids
    : null
}

const runParams = z.object({ platform: z.enum(['meta', 'google', 'all']).default('all') })
type RunArgs = z.infer<typeof runParams>

export async function runAdspendSync(
  args: RunArgs,
  ctx: ToolContext,
  deps: AdspendSyncDeps = defaultDeps
): Promise<ToolResult> {
  try {
    const reservation = await deps.reserveCooldown(args.platform, ctx.userId)
    if (!reservation.accepted) {
      const remaining = Math.max(0, Math.ceil((Date.parse(reservation.nextAllowedAt) - deps.now().getTime()) / 1000))
      return ok({ accepted: false, reason: 'cooldown', cooldownMinutes: ADSPEND_SYNC_COOLDOWN_MINUTES, cooldownRemainingSeconds: remaining, nextAllowedAt: reservation.nextAllowedAt })
    }
    const platforms: JobPlatform[] = args.platform === 'all' ? ['meta', 'google'] : [args.platform]
    const outcomes = await Promise.all(platforms.map(async (platform) => {
      try {
        return { platform, job: await deps.startPlatform(platform, ctx), reason: null as string | null }
      } catch (err) {
        const reason = describeError(err)
        console.error(`[run_adspend_sync] ${platform} start failed: ${reason}`)
        return { platform, job: null as StartedJob | null, reason }
      }
    }))
    const started = outcomes.filter((o): o is { platform: JobPlatform, job: StartedJob, reason: null } => o.job !== null)
    const failedPlatforms = outcomes.filter(o => o.job === null).map(o => ({ platform: o.platform, reason: o.reason as string }))

    if (started.length === 0) {
      // Nothing was enqueued: give the 30-minute slot back so the operator can retry once the cause is fixed.
      await deps.releaseCooldown(ctx.userId).catch(() => {})
      const summary = failedPlatforms.map(f => `${f.platform}: ${f.reason}`).join('; ')
      return fail(`Could not start the ad-spend sync — ${summary}`, 'SYNC_START_FAILED', { failedPlatforms })
    }

    return ok({
      accepted: true,
      asynchronous: true,
      handle: encodeHandle(started.map(o => o.job.jobId)),
      nextAllowedAt: reservation.nextAllowedAt,
      jobs: started.map(o => ({ platform: o.platform, status: o.job.status, queued: o.job.queued ?? null, accounts: o.job.accounts ?? null, reapedJobIds: o.job.reapedJobIds ?? [] })),
      failedPlatforms
    })
  } catch (err) {
    const reason = describeError(err)
    console.error(`[run_adspend_sync] start failed before fan-out: ${reason}`)
    return fail(`Could not start the ad-spend sync — ${reason}`, 'SYNC_START_FAILED')
  }
}

const FAILURE_REASON_GROUP_CAP = 5

/**
 * Groups per-account failures by reason so a systemic outage (same reason × N accounts) is visible at a
 * glance. Bounded to the FAILURE_REASON_GROUP_CAP most common reasons; `more` says how many were dropped.
 */
function summariseFailures(failures: SpendSyncJobRow['failures']): { groups: Array<{ reason: string, accounts: number, examples: string[] }>, more: number } {
  if (!Array.isArray(failures) || failures.length === 0) return { groups: [], more: 0 }
  const groups = new Map<string, { accounts: number, examples: string[] }>()
  for (const f of failures) {
    const reason = String(f?.reason || 'Unknown error')
    const g = groups.get(reason) ?? { accounts: 0, examples: [] }
    g.accounts++
    if (g.examples.length < 3 && f?.account) g.examples.push(String(f.account))
    groups.set(reason, g)
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].accounts - a[1].accounts)
  return {
    groups: sorted.slice(0, FAILURE_REASON_GROUP_CAP).map(([reason, g]) => ({ reason, accounts: g.accounts, examples: g.examples })),
    more: Math.max(0, sorted.length - FAILURE_REASON_GROUP_CAP)
  }
}

const statusParams = z.object({ handle: z.string().trim().min(1).max(500) })
type StatusArgs = z.infer<typeof statusParams>

export async function getAdspendSyncStatus(
  args: StatusArgs,
  ctx: ToolContext,
  deps: AdspendSyncDeps = defaultDeps
): Promise<ToolResult> {
  const ids = parseHandle(args.handle)
  if (!ids) return fail('Invalid ad-spend sync handle.', 'INVALID_SYNC_HANDLE')
  try {
    const jobs = await deps.loadJobs(ids, ctx.userId)
    if (jobs.length !== ids.length) return fail('Ad-spend sync handle was not found for this user.', 'SYNC_NOT_FOUND')
    const failed = jobs.some(job => job.status === 'failed' || job.coverage_failed)
    const completed = jobs.every(job => job.status === 'completed'
      && !job.coverage_failed
      && (job.total_accounts == null || Number(job.processed_accounts) >= Number(job.total_accounts)))
    const state = failed ? 'failed' : completed ? 'completed' : 'running'
    return ok({
      handle: args.handle,
      state,
      coverageVerified: jobs.every(job => !job.coverage_failed),
      rowsWritten: jobs.reduce((sum, job) => sum + Number(job.synced_count || 0), 0),
      jobs: jobs.map(job => ({
        platform: job.platform,
        period: job.period,
        state: job.status,
        rowsWritten: Number(job.synced_count || 0),
        processedAccounts: Number(job.processed_accounts || 0),
        totalAccounts: job.total_accounts == null ? null : Number(job.total_accounts),
        coverageVerified: !job.coverage_failed,
        failureCount: Array.isArray(job.failures) ? job.failures.length : 0,
        failureReasons: summariseFailures(job.failures),
        error: job.error,
        startedAt: job.started_at,
        finishedAt: job.finished_at
      }))
    })
  } catch (err) {
    const reason = describeError(err)
    console.error(`[get_sync_status] load failed: ${reason}`)
    return fail(`Could not load the ad-spend sync status — ${reason}`, 'SYNC_STATUS_FAILED')
  }
}

export const runAdspendSyncTool: AiTool<RunArgs> = {
  name: 'run_adspend_sync',
  description: 'Start an asynchronous Meta, Google, or combined ad-spend sync and return an opaque job handle immediately. Use when current spend data is stale or an operator explicitly requests a refresh; poll get_sync_status with the returned handle rather than waiting in this call. A global atomic 30-minute cooldown prevents repeated provider fan-out. This operational tool writes only sync telemetry and provider spend snapshots; it never changes campaign settings or budgets.',
  parameters: runParams,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => runAdspendSync(args, ctx)
}

export const getAdspendSyncStatusTool: AiTool<StatusArgs> = {
  name: 'get_sync_status',
  description: 'Poll an opaque handle returned by run_adspend_sync. Returns running, completed, or failed plus rows written, account progress, timestamps, and an explicit coverageVerified flag. Completed is reported only after every provider job is terminal and its campaign-coverage gate passed. Read-only.',
  parameters: statusParams,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => getAdspendSyncStatus(args, ctx)
}
