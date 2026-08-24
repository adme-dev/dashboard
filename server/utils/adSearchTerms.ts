import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'
import { sanitizeDiagnosticError } from '~~/server/utils/adDiagnostics'
import { escapeLike, type ToolContext } from '~~/server/utils/ai/toolContext'

export const SEARCH_TERM_SOURCE_CAP = 5_000

export type SearchTermCoverage = 'full' | 'limited' | 'unsupported' | 'unavailable'

export type SearchTermTarget = {
  mediaSpendId: string
  campaignId: string
  campaignName: string
  campaignType: string | null
  platform: 'google' | 'meta'
  clientId: string | null
  clientName: string | null
  connectionId: string | null
}

export type StoredSearchTerm = {
  searchTerm: string
  matchType: string | null
  targetingStatus: string | null
  impressions: number
  clicks: number
  cost: number
}

export type SearchTermSnapshot = {
  coverage: SearchTermCoverage
  coverageReason: string | null
  asOf: string | null
  lastAttemptedAt: string | null
  lastError: string | null
  sourceTotal: number
  truncatedAtSource: boolean
  terms: StoredSearchTerm[]
}

export type SearchTermTargetArgs = {
  campaignId?: string
  campaignName?: string
  clientName?: string
}

function coverageFor(target: SearchTermTarget): { coverage: SearchTermCoverage, reason: string } {
  if (target.platform !== 'google') {
    return { coverage: 'unsupported', reason: 'Search terms are available only for connected Google Ads campaigns.' }
  }
  const campaignType = String(target.campaignType || '').toUpperCase()
  if (campaignType === 'PERFORMANCE_MAX') {
    return { coverage: 'limited', reason: 'Google exposes only limited search-term insight for Performance Max campaigns.' }
  }
  if (campaignType === 'SEARCH' || campaignType === 'SHOPPING') {
    return { coverage: 'full', reason: 'Google campaign search-term view coverage for this campaign type.' }
  }
  return { coverage: 'unsupported', reason: `Google search terms are not supported for campaign type ${campaignType || 'UNKNOWN'}.` }
}

export async function resolveSearchTermTarget(
  args: SearchTermTargetArgs,
  ctx: ToolContext,
): Promise<SearchTermTarget | null> {
  const conditions: string[] = ['ms.campaign_id IS NOT NULL']
  const values: unknown[] = []
  const add = (sql: string, value: unknown) => {
    values.push(value)
    conditions.push(sql.replace('?', `$${values.length}`))
  }
  if (args.campaignId) add('ms.campaign_id = ?', args.campaignId)
  if (args.campaignName) add(`ms.campaign_name ILIKE ? ESCAPE '\\'`, `%${escapeLike(args.campaignName)}%`)
  if (args.clientName) add(`client.name ILIKE ? ESCAPE '\\'`, `%${escapeLike(args.clientName)}%`)
  if (ctx.clientScope) add('ms.client_id = ?::uuid', ctx.clientScope)
  if (ctx.assistantScope?.clientAccessMode === 'assigned') {
    values.push(ctx.assistantScope.assignedClientIds)
    conditions.push(`ms.client_id = ANY($${values.length}::uuid[])`)
  }
  const row = await queryOne<any>(
    `SELECT ms.id, ms.campaign_id, ms.campaign_name, ms.campaign_type, ms.platform,
            ms.client_id, client.name AS client_name, ms.connection_id
       FROM media_spend ms
       LEFT JOIN agency_clients client ON client.id = ms.client_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN $${values.length + 1}::text IS NOT NULL AND LOWER(ms.campaign_name) = LOWER($${values.length + 1}) THEN 0 ELSE 1 END,
        ms.synced_at DESC NULLS LAST
      LIMIT 1`,
    [...values, args.campaignName || null],
  )
  if (!row) return null
  return {
    mediaSpendId: String(row.id),
    campaignId: String(row.campaign_id),
    campaignName: String(row.campaign_name || 'Unknown'),
    campaignType: row.campaign_type == null ? null : String(row.campaign_type).toUpperCase(),
    platform: String(row.platform).startsWith('google') ? 'google' : 'meta',
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    connectionId: row.connection_id || null,
  }
}

export async function loadCampaignSearchTerms(
  mediaSpendId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<SearchTermSnapshot | null> {
  const sync = await queryOne<any>(
    `SELECT id, coverage, coverage_reason, synced_at, last_attempted_at, last_error,
            source_total, truncated_at_source
       FROM campaign_search_term_syncs
      WHERE media_spend_id = $1 AND range_start = $2 AND range_end = $3`,
    [mediaSpendId, rangeStart, rangeEnd],
  )
  if (!sync) return null
  const rows = await queryRows<any>(
    `SELECT search_term, match_type, targeting_status, impressions, clicks, cost
       FROM campaign_search_term_snapshots
      WHERE sync_id = $1`,
    [sync.id],
  )
  return {
    coverage: sync.coverage,
    coverageReason: sync.coverage_reason || null,
    asOf: sync.synced_at || null,
    lastAttemptedAt: sync.last_attempted_at || null,
    lastError: sync.last_error || null,
    sourceTotal: Number(sync.source_total || 0),
    truncatedAtSource: sync.truncated_at_source === true,
    terms: rows.map(row => ({
      searchTerm: String(row.search_term),
      matchType: row.match_type || null,
      targetingStatus: row.targeting_status || null,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      cost: Number(row.cost || 0),
    })),
  }
}

async function persistSuccessfulSnapshot(
  target: SearchTermTarget,
  rangeStart: string,
  rangeEnd: string,
  coverage: SearchTermCoverage,
  coverageReason: string,
  terms: StoredSearchTerm[],
  sourceTotal: number,
  truncatedAtSource: boolean,
): Promise<void> {
  await transaction(async (db) => {
    const syncResult = await db.query<{ id: string }>(
      `INSERT INTO campaign_search_term_syncs (
         media_spend_id, range_start, range_end, coverage, coverage_reason, synced_at,
         last_attempted_at, last_error, source_total, truncated_at_source
       ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NULL,$6,$7)
       ON CONFLICT (media_spend_id, range_start, range_end)
       DO UPDATE SET coverage=$4, coverage_reason=$5, synced_at=NOW(), last_attempted_at=NOW(),
                     last_error=NULL, source_total=$6, truncated_at_source=$7
       RETURNING id`,
      [target.mediaSpendId, rangeStart, rangeEnd, coverage, coverageReason, sourceTotal, truncatedAtSource],
    )
    const syncId = syncResult.rows[0]?.id
    if (!syncId) throw new Error('Search-term sync state did not return an id.')
    await db.query('DELETE FROM campaign_search_term_snapshots WHERE sync_id = $1', [syncId])
    const chunkSize = 200
    for (let offset = 0; offset < terms.length; offset += chunkSize) {
      const chunk = terms.slice(offset, offset + chunkSize)
      const params: unknown[] = []
      const values = chunk.map((term, index) => {
        const base = index * 7
        params.push(syncId, term.searchTerm, term.matchType, term.targetingStatus, term.impressions, term.clicks, term.cost)
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
      })
      await db.query(
        `INSERT INTO campaign_search_term_snapshots (
           sync_id, search_term, match_type, targeting_status, impressions, clicks, cost
         ) VALUES ${values.join(',')}`,
        params,
      )
    }
  })
}

async function persistFailedAttempt(
  target: SearchTermTarget,
  rangeStart: string,
  rangeEnd: string,
  reason: string,
): Promise<void> {
  await queryOne(
    `INSERT INTO campaign_search_term_syncs (
       media_spend_id, range_start, range_end, coverage, coverage_reason,
       synced_at, last_attempted_at, last_error, source_total, truncated_at_source
     ) VALUES ($1,$2,$3,'unavailable',$4,NULL,NOW(),$4,0,FALSE)
     ON CONFLICT (media_spend_id, range_start, range_end)
     DO UPDATE SET last_attempted_at=NOW(), last_error=$4,
                   coverage=CASE WHEN campaign_search_term_syncs.synced_at IS NULL THEN 'unavailable' ELSE campaign_search_term_syncs.coverage END,
                   coverage_reason=CASE WHEN campaign_search_term_syncs.synced_at IS NULL THEN $4 ELSE campaign_search_term_syncs.coverage_reason END
     RETURNING id`,
    [target.mediaSpendId, rangeStart, rangeEnd, reason],
  )
}

export async function syncCampaignSearchTerms(
  target: SearchTermTarget,
  rangeStart: string,
  rangeEnd: string,
): Promise<SearchTermSnapshot> {
  const support = coverageFor(target)
  if (support.coverage === 'unsupported') {
    await persistSuccessfulSnapshot(target, rangeStart, rangeEnd, support.coverage, support.reason, [], 0, false)
    return (await loadCampaignSearchTerms(target.mediaSpendId, rangeStart, rangeEnd))!
  }
  if (!target.connectionId) {
    const reason = 'Campaign has no connected Google Ads account.'
    await persistFailedAttempt(target, rangeStart, rangeEnd, reason)
    return (await loadCampaignSearchTerms(target.mediaSpendId, rangeStart, rangeEnd))!
  }
  try {
    const conn = await queryOne<GoogleCredentialRow & {
      id: string
      access_token: string
      refresh_token: string | null
      token_expires_at: string | null
      account_id: string
      metadata: any
    }>(
      `SELECT sc.id, sc.access_token, sc.refresh_token, sc.token_expires_at,
              sc.account_id, sc.metadata, ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
         FROM social_connections sc
         ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
        WHERE sc.id = $1`,
      [target.connectionId],
    )
    if (!conn) throw new Error('Google Ads connection not found.')
    const credential = await resolveGoogleCredential(conn)
    conn.access_token = credential.accessToken
    conn.refresh_token = credential.refreshToken
    conn.token_expires_at = credential.tokenExpiresAt
    conn.google_credential_profile_id = credential.profileId
    const config = useRuntimeConfig()
    if (conn.refresh_token && conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now() + 300_000) {
      const { refreshGoogleToken } = await import('~~/server/utils/googleAdsClient')
      const refreshed = await refreshGoogleToken(conn.refresh_token, config.googleClientId, config.googleClientSecret)
      conn.access_token = refreshed.access_token
      await persistGoogleCredentialRefresh({
        connectionId: conn.id,
        profileId: conn.google_credential_profile_id || null,
        accessToken: conn.access_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      })
    }
    const { getGoogleCampaignSearchTerms } = await import('~~/server/utils/googleAdsClient')
    const managerId = conn.metadata?.managerCustomerId || config.googleAdsLoginCustomerId || undefined
    const providerRows = await getGoogleCampaignSearchTerms(
      conn.account_id,
      conn.access_token,
      config.googleDeveloperToken,
      target.campaignId,
      rangeStart,
      rangeEnd,
      managerId,
    )
    const stored = providerRows.slice(0, SEARCH_TERM_SOURCE_CAP)
    await persistSuccessfulSnapshot(
      target,
      rangeStart,
      rangeEnd,
      support.coverage,
      support.reason,
      stored,
      providerRows.length,
      providerRows.length > SEARCH_TERM_SOURCE_CAP,
    )
  } catch (error) {
    await persistFailedAttempt(target, rangeStart, rangeEnd, sanitizeDiagnosticError(error))
  }
  return (await loadCampaignSearchTerms(target.mediaSpendId, rangeStart, rangeEnd))!
}
