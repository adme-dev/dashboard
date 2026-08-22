import type { H3Event } from 'h3'
import {
  syncMetaSpend,
  listMetaConnectionIds,
  listGoogleConnectionIds,
  syncGoogleSpend,
  syncMicrosoftSpend,
  syncPinterestSpend,
  syncTikTokSpend,
  syncLinkedinSpend,
  syncSnapchatSpend,
  syncTwitterSpend
} from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { getQueue } from '~~/server/utils/queue'
import { completeSpendSyncJob, createSpendSyncJob, failSpendSyncJob, reapOrphanedSpendSyncJobs, setSyncJobTotalAccounts } from '~~/server/utils/spendSyncJobs'

interface PlatformDef {
  platform: string
  short: string
  fn: (month: number, year: number) => Promise<unknown>
}

// Every non-Meta platform syncs in a single background loop (the same path the
// manual UI endpoints use). `short` matches the KV cache key namespace each
// platform's spend reads from, so the cache is busted on completion.
const SECONDARY_PLATFORMS: PlatformDef[] = [
  { platform: 'microsoft_ads', short: 'microsoft_ads', fn: syncMicrosoftSpend },
  { platform: 'pinterest', short: 'pinterest', fn: syncPinterestSpend },
  { platform: 'tiktok', short: 'tiktok', fn: syncTikTokSpend },
  { platform: 'linkedin', short: 'linkedin', fn: syncLinkedinSpend },
  { platform: 'snapchat', short: 'snapchat', fn: syncSnapchatSpend },
  { platform: 'twitter', short: 'twitter', fn: syncTwitterSpend }
]

export type SpendSyncKickoffPlatform = 'meta' | 'google'

export interface SpendSyncPlatformStart {
  status: 'started'
  startedAt: string
  jobId: string
  /** true = fanned out per account via the queue; false = inline waitUntil fallback (no queue binding). */
  queued: boolean
  accounts: number
  /** Jobs that were still 'running' from earlier starts and were terminalised as orphans first. */
  reapedJobIds: string[]
}

const PLATFORM_FANOUT = {
  meta: {
    list: () => listMetaConnectionIds(),
    messageType: 'spend.sync.meta.account' as const,
    sync: (month: number, year: number) => syncMetaSpend(month, year),
    kvKeys: (period: string) => [`spend:summary:${period}:all`, `spend:summary:${period}:meta`, `spend:meta:accounts:${period}`, `spend:daily:meta:${period}`]
  },
  google: {
    list: () => listGoogleConnectionIds(),
    messageType: 'spend.sync.google.account' as const,
    sync: (month: number, year: number) => syncGoogleSpend(month, year),
    kvKeys: (period: string) => [`spend:summary:${period}:all`, `spend:summary:${period}:google_ads`, `spend:google:accounts:${period}`, `spend:daily:google:${period}`]
  }
}

/**
 * Start one platform's spend sync for a period. Shared by the two HTTP endpoints and the MCP
 * run_adspend_sync tool. MUST be handed the ORIGINATING request event: Cloudflare bindings
 * (JOBS_QUEUE) live on event.context.cloudflare.env and are not carried across Nitro's in-process
 * $fetch, so a kickoff reached via an internal HTTP hop silently drops to the inline path and is
 * cut off by the time budget at ~100 accounts (2026-08-22).
 */
export async function startSpendSyncPlatform(
  event: H3Event,
  platform: SpendSyncKickoffPlatform,
  month: number,
  year: number,
  startedBy: string | null
): Promise<SpendSyncPlatformStart> {
  const period = `${year}-${String(month).padStart(2, '0')}`
  const reapedJobIds = await reapOrphanedSpendSyncJobs(platform).catch(() => [] as string[])
  const jobId = await createSpendSyncJob(platform, period, startedBy)
  const startedAt = new Date().toISOString()
  const fan = PLATFORM_FANOUT[platform]

  const queue = getQueue(event)
  if (queue) {
    try {
      const connectionIds = await fan.list()
      if (connectionIds.length === 0) {
        await completeSpendSyncJob(jobId, { synced: 0, totalSpend: 0, failures: [] })
        return { status: 'started', startedAt, jobId, queued: true, accounts: 0, reapedJobIds }
      }
      await setSyncJobTotalAccounts(jobId, connectionIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(connectionIds.map(connectionId =>
        queue.send({ type: fan.messageType, payload: { connectionId, month, year, jobId }, enqueuedAt }, { contentType: 'json' })
      ))
      return { status: 'started', startedAt, jobId, queued: true, accounts: connectionIds.length, reapedJobIds }
    } catch (err) {
      console.error(`[${platform} sync-spend] fan-out enqueue failed, falling back to inline waitUntil:`, err)
    }
  } else {
    console.warn(`[${platform} sync-spend] no JOBS_QUEUE binding on this event — inline fallback (may be cut off by the time budget)`)
  }

  runSpendSyncInBackground(event, {
    label: `${platform} sync-spend ${period}`,
    sync: () => fan.sync(month, year),
    kvKeys: fan.kvKeys(period),
    extra: { jobId },
    onComplete: result => completeSpendSyncJob(jobId, result),
    onError: err => failSpendSyncJob(jobId, err instanceof Error ? err.message : String(err))
  })
  return { status: 'started', startedAt, jobId, queued: false, accounts: 0, reapedJobIds }
}

export interface SpendSyncKickoffResult {
  period: string
  meta: 'queued' | 'background' | 'error'
  google: 'queued' | 'background' | 'error'
  secondary: string[]
}

/**
 * Kick off a full ad-spend sync across every platform WITHOUT blocking the
 * request, then return immediately.
 *
 * Meta fans out one queue message per ad account — the only path that reliably
 * finishes 100+ accounts inside Cloudflare's limits. The remaining platforms
 * run via the same waitUntil-backed background helper the manual UI endpoints
 * use. Because nothing is awaited to completion here, a cron caller gets a fast
 * response and never hits the Pages function time limit — the failure mode that
 * left the old synchronous /api/internal/sync-spend cron never writing data.
 */
export async function startSpendSyncAllPlatforms(
  event: H3Event,
  month: number,
  year: number
): Promise<SpendSyncKickoffResult> {
  const period = `${year}-${String(month).padStart(2, '0')}`
  let meta: SpendSyncKickoffResult['meta'] = 'background'

  // Meta — prefer per-account queue fan-out; fall back to an inline background
  // sync when there's no queue binding (e.g. local dev).
  try {
    const queue = getQueue(event)
    const connectionIds = queue ? await listMetaConnectionIds() : []
    if (queue && connectionIds.length > 0) {
      const jobId = await createSpendSyncJob('meta', period, null)
      await setSyncJobTotalAccounts(jobId, connectionIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(
        connectionIds.map(connectionId =>
          queue!.send(
            { type: 'spend.sync.meta.account', payload: { connectionId, month, year, jobId }, enqueuedAt },
            { contentType: 'json' }
          )
        )
      )
      meta = 'queued'
    } else {
      runSpendSyncInBackground(event, {
        label: `cron meta sync-spend ${period}`,
        sync: () => syncMetaSpend(month, year),
        kvKeys: [
          `spend:summary:${period}:all`,
          `spend:summary:${period}:meta`,
          `spend:meta:accounts:${period}`,
          `spend:daily:meta:${period}`
        ]
      })
      meta = 'background'
    }
  } catch (err) {
    console.error('[cron sync-spend] meta kickoff failed:', err)
    meta = 'error'
  }

  // Google — per-account queue fan-out (same durable path as Meta). The old
  // single-waitUntil loop was killed by Cloudflare's time budget at ~100 accounts.
  let google: SpendSyncKickoffResult['google'] = 'background'
  try {
    const gqueue = getQueue(event)
    const googleIds = gqueue ? await listGoogleConnectionIds() : []
    if (gqueue && googleIds.length > 0) {
      const jobId = await createSpendSyncJob('google', period, null)
      await setSyncJobTotalAccounts(jobId, googleIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(googleIds.map(connectionId =>
        gqueue!.send({ type: 'spend.sync.google.account', payload: { connectionId, month, year, jobId }, enqueuedAt }, { contentType: 'json' })
      ))
      google = 'queued'
    } else {
      runSpendSyncInBackground(event, {
        label: `cron google sync-spend ${period}`,
        sync: () => syncGoogleSpend(month, year),
        kvKeys: [`spend:summary:${period}:all`, `spend:summary:${period}:google_ads`, `spend:google:accounts:${period}`, `spend:daily:google:${period}`]
      })
      google = 'background'
    }
  } catch (err) {
    console.error('[cron sync-spend] google kickoff failed:', err)
    google = 'error'
  }

  const secondary: string[] = []
  for (const p of SECONDARY_PLATFORMS) {
    try {
      runSpendSyncInBackground(event, {
        label: `cron ${p.platform} sync-spend ${period}`,
        sync: () => p.fn(month, year),
        kvKeys: [
          `spend:summary:${period}:all`,
          `spend:summary:${period}:${p.platform}`,
          `spend:${p.short}:accounts:${period}`,
          `spend:daily:${p.short}:${period}`
        ]
      })
      secondary.push(p.platform)
    } catch (err) {
      console.error(`[cron sync-spend] ${p.platform} kickoff failed:`, err)
    }
  }

  return { period, meta, google, secondary }
}
