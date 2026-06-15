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
  syncTwitterSpend,
} from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { getQueue } from '~~/server/utils/queue'
import { createSpendSyncJob, setSyncJobTotalAccounts } from '~~/server/utils/spendSyncJobs'

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
  { platform: 'twitter', short: 'twitter', fn: syncTwitterSpend },
]

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
          `spend:daily:meta:${period}`,
        ],
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
        kvKeys: [`spend:summary:${period}:all`, `spend:summary:${period}:google_ads`, `spend:google:accounts:${period}`, `spend:daily:google:${period}`],
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
          `spend:daily:${p.short}:${period}`,
        ],
      })
      secondary.push(p.platform)
    } catch (err) {
      console.error(`[cron sync-spend] ${p.platform} kickoff failed:`, err)
    }
  }

  return { period, meta, google, secondary }
}
