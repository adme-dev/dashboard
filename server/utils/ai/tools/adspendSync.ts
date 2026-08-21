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

async function startPlatform(platform: JobPlatform, ctx: ToolContext): Promise<StartedJob> {
  return await aiInternalFetch<StartedJob>(`/api/agency/social/${platform}/sync-spend`, { method: 'POST', body: {} }, ctx)
}

async function loadJobs(ids: string[], userId: string): Promise<SpendSyncJobRow[]> {
  return await queryRows<SpendSyncJobRow>(
    `SELECT id, platform, period, status, synced_count, failures, error,
            started_at::text, finished_at::text, total_accounts, processed_accounts,
            coverage_failed
       FROM spend_sync_jobs
      WHERE id = ANY($1::uuid[]) AND started_by = $2::uuid
      ORDER BY started_at`,
    [ids, userId]
  )
}

const defaultDeps: AdspendSyncDeps = { reserveCooldown, startPlatform, loadJobs, now: () => new Date() }

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
    const jobs = await Promise.all(platforms.map(async platform => ({ platform, ...(await deps.startPlatform(platform, ctx)) })))
    return ok({
      accepted: true,
      asynchronous: true,
      handle: encodeHandle(jobs.map(job => job.jobId)),
      nextAllowedAt: reservation.nextAllowedAt,
      jobs: jobs.map(job => ({ platform: job.platform, status: job.status, queued: job.queued ?? null, accounts: job.accounts ?? null })),
    })
  } catch {
    return fail('Could not start the ad-spend sync.', 'SYNC_START_FAILED')
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
        error: job.error,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
      })),
    })
  } catch {
    return fail('Could not load the ad-spend sync status.', 'SYNC_STATUS_FAILED')
  }
}

export const runAdspendSyncTool: AiTool<RunArgs> = {
  name: 'run_adspend_sync',
  description: 'Start an asynchronous Meta, Google, or combined ad-spend sync and return an opaque job handle immediately. Use when current spend data is stale or an operator explicitly requests a refresh; poll get_sync_status with the returned handle rather than waiting in this call. A global atomic 30-minute cooldown prevents repeated provider fan-out. This operational tool writes only sync telemetry and provider spend snapshots; it never changes campaign settings or budgets.',
  parameters: runParams,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => runAdspendSync(args, ctx),
}

export const getAdspendSyncStatusTool: AiTool<StatusArgs> = {
  name: 'get_sync_status',
  description: 'Poll an opaque handle returned by run_adspend_sync. Returns running, completed, or failed plus rows written, account progress, timestamps, and an explicit coverageVerified flag. Completed is reported only after every provider job is terminal and its campaign-coverage gate passed. Read-only.',
  parameters: statusParams,
  requiredPermission: 'MEDIA_BUYING',
  handler: (args, ctx) => getAdspendSyncStatus(args, ctx),
}

