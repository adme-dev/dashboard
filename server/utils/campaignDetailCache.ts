import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { syncCampaignBreakdowns, syncCampaignCreatives } from '~~/server/utils/onDemandSync'
import { enqueue } from '~~/server/utils/queue'

export type CampaignDetailDataset = 'breakdowns' | 'creatives'

export interface CampaignRefreshMeta {
  status: 'missing' | 'stale' | 'refreshing' | 'fresh' | 'failed'
  stale: boolean
  refreshing: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  dataThroughAt: string | null
  nextRefreshAt: string | null
  lastError: string | null
  refreshCount: number
}

interface RefreshRow {
  campaign_status: string | null
  end_date: string | null
  period: string
  source_synced_at: string | null
  status: CampaignRefreshMeta['status'] | null
  last_attempt_at: string | null
  last_success_at: string | null
  data_through_at: string | null
  next_refresh_at: string | null
  lease_until: string | null
  last_error: string | null
  refresh_count: number | null
}

const LEASE_MS = 2 * 60 * 1000

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

function isActiveCampaign(row: RefreshRow): boolean {
  const activeStatuses = new Set(['ACTIVE', 'ENABLED', 'DELIVERING', 'RUNNING'])
  const status = String(row.campaign_status || '').toUpperCase()
  const endDateIsCurrent = !row.end_date || new Date(row.end_date).getTime() >= Date.now()
  return row.period === currentPeriod() && endDateIsCurrent && (!status || activeStatuses.has(status))
}

function freshnessMs(dataset: CampaignDetailDataset, row: RefreshRow): number {
  if (dataset === 'creatives') {
    return isActiveCampaign(row) ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  }
  if (row.period !== currentPeriod()) return 24 * 60 * 60 * 1000
  return isActiveCampaign(row) ? 15 * 60 * 1000 : 4 * 60 * 60 * 1000
}

async function refreshRow(
  mediaSpendId: string,
  dataset: CampaignDetailDataset
): Promise<RefreshRow | null> {
  return queryOne<RefreshRow>(`
    SELECT
      ms.campaign_status,
      ms.end_date,
      ms.period,
      ms.synced_at AS source_synced_at,
      rs.status,
      rs.last_attempt_at,
      rs.last_success_at,
      rs.data_through_at,
      rs.next_refresh_at,
      rs.lease_until,
      rs.last_error,
      rs.refresh_count
    FROM media_spend ms
    LEFT JOIN campaign_detail_refresh_state rs
      ON rs.media_spend_id = ms.id
     AND rs.dataset = $2
    WHERE ms.id = $1
  `, [mediaSpendId, dataset])
}

function toMeta(row: RefreshRow | null): CampaignRefreshMeta {
  if (!row) {
    return {
      status: 'missing',
      stale: true,
      refreshing: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      dataThroughAt: null,
      nextRefreshAt: null,
      lastError: null,
      refreshCount: 0,
    }
  }

  const leaseActive = Boolean(row.lease_until && new Date(row.lease_until).getTime() > Date.now())
  const stale = !row.last_success_at
    || !row.next_refresh_at
    || new Date(row.next_refresh_at).getTime() <= Date.now()

  return {
    status: leaseActive ? 'refreshing' : (row.status || 'missing'),
    stale,
    refreshing: leaseActive,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    dataThroughAt: row.data_through_at || row.source_synced_at,
    nextRefreshAt: row.next_refresh_at,
    lastError: row.last_error,
    refreshCount: Number(row.refresh_count || 0),
  }
}

export async function getCampaignRefreshMeta(
  mediaSpendId: string,
  dataset: CampaignDetailDataset
): Promise<CampaignRefreshMeta> {
  return toMeta(await refreshRow(mediaSpendId, dataset))
}

async function captureMetricSnapshot(mediaSpendId: string): Promise<void> {
  await queryOne(`
    INSERT INTO campaign_metric_snapshots (
      media_spend_id,
      platform,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      data_through_at
    )
    SELECT
      id,
      platform,
      COALESCE(actual_spend, 0),
      COALESCE(impressions, 0),
      COALESCE(clicks, 0),
      COALESCE(conversions, 0),
      COALESCE(revenue, 0),
      synced_at
    FROM media_spend
    WHERE id = $1
    RETURNING id
  `, [mediaSpendId])

  await queryOne(`
    DELETE FROM campaign_metric_snapshots
    WHERE id IN (
      SELECT id
      FROM campaign_metric_snapshots
      WHERE media_spend_id = $1
      ORDER BY captured_at DESC
      OFFSET 20
    )
    RETURNING id
  `, [mediaSpendId])
}

async function performRefresh(
  mediaSpendId: string,
  dataset: CampaignDetailDataset,
  leaseToken: string,
  ttlMs: number
): Promise<void> {
  try {
    if (dataset === 'breakdowns') {
      await syncCampaignBreakdowns(mediaSpendId)
      await captureMetricSnapshot(mediaSpendId)
    } else {
      await syncCampaignCreatives(mediaSpendId)
    }

    await queryOne(`
      UPDATE campaign_detail_refresh_state rs
      SET status = 'fresh',
          last_success_at = NOW(),
          data_through_at = ms.synced_at,
          next_refresh_at = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
          lease_token = NULL,
          lease_until = NULL,
          last_error = NULL,
          refresh_count = rs.refresh_count + 1,
          updated_at = NOW()
      FROM media_spend ms
      WHERE rs.media_spend_id = $1
        AND rs.dataset = $2
        AND rs.lease_token = $3::uuid
        AND ms.id = rs.media_spend_id
      RETURNING rs.media_spend_id
    `, [mediaSpendId, dataset, leaseToken, ttlMs])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await queryOne(`
      UPDATE campaign_detail_refresh_state
      SET status = 'failed',
          next_refresh_at = NOW() + INTERVAL '5 minutes',
          lease_token = NULL,
          lease_until = NULL,
          last_error = LEFT($4, 1000),
          updated_at = NOW()
      WHERE media_spend_id = $1
        AND dataset = $2
        AND lease_token = $3::uuid
      RETURNING media_spend_id
    `, [mediaSpendId, dataset, leaseToken, message])
    throw error
  }
}

export async function requestCampaignDetailRefresh(
  event: H3Event,
  mediaSpendId: string,
  dataset: CampaignDetailDataset,
  options: { force?: boolean } = {}
): Promise<CampaignRefreshMeta> {
  const row = await refreshRow(mediaSpendId, dataset)
  const current = toMeta(row)
  if (!row || current.refreshing || (!options.force && !current.stale)) return current

  const leaseToken = crypto.randomUUID()
  const ttlMs = freshnessMs(dataset, row)
  const acquired = await queryOne<{ media_spend_id: string }>(`
    INSERT INTO campaign_detail_refresh_state (
      media_spend_id,
      dataset,
      status,
      last_attempt_at,
      lease_token,
      lease_until,
      created_at,
      updated_at
    )
    VALUES ($1, $2, 'refreshing', NOW(), $3::uuid, NOW() + INTERVAL '2 minutes', NOW(), NOW())
    ON CONFLICT (media_spend_id, dataset) DO UPDATE
    SET status = 'refreshing',
        last_attempt_at = NOW(),
        lease_token = $3::uuid,
        lease_until = NOW() + INTERVAL '2 minutes',
        last_error = NULL,
        updated_at = NOW()
    WHERE (
      campaign_detail_refresh_state.lease_until IS NULL
      OR campaign_detail_refresh_state.lease_until <= NOW()
    )
      AND (
        $4::boolean
        OR campaign_detail_refresh_state.next_refresh_at IS NULL
        OR campaign_detail_refresh_state.next_refresh_at <= NOW()
      )
    RETURNING media_spend_id
  `, [mediaSpendId, dataset, leaseToken, Boolean(options.force)])

  if (!acquired) return getCampaignRefreshMeta(mediaSpendId, dataset)

  await enqueue(
    event,
    'campaign.detail.refresh',
    { mediaSpendId, dataset, leaseToken, ttlMs },
    () => {
      runAfterResponse(
        event,
        performRefresh(mediaSpendId, dataset, leaseToken, ttlMs),
        `campaign-${dataset}-refresh`
      )
      return Promise.resolve()
    }
  )

  return {
    ...current,
    status: 'refreshing',
    stale: current.stale,
    refreshing: true,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
  }
}

/**
 * Runs a previously-claimed campaign detail refresh from the durable job queue. The payload carries
 * everything `performRefresh` needs (mediaSpendId/dataset/leaseToken/ttlMs) — `performRefresh` itself
 * already re-checks the lease token on write, so a stale/expired lease is a safe no-op.
 */
export async function runCampaignDetailRefreshJob(
  _event: H3Event,
  payload: { mediaSpendId: string, dataset: CampaignDetailDataset, leaseToken: string, ttlMs: number }
): Promise<void> {
  await performRefresh(payload.mediaSpendId, payload.dataset, payload.leaseToken, payload.ttlMs)
}
