import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { escapeLike } from '../toolContext'
import { clientScopeSql, requireMarketingReadPermission, type MarketingReadScope } from './readScope'
import { resolveScopedClient, ownerClientNameSql } from './clientReads'
import type { CampaignIdentity } from './adReads'
import type { SearchTermSnapshot, SearchTermTarget, SearchTermTargetArgs } from '~~/server/utils/adSearchTerms'

export async function resolveScopedSearchTermTarget(scope: MarketingReadScope, args: SearchTermTargetArgs): Promise<SearchTermTarget | null> {
  requireMarketingReadPermission(scope, 'search_terms')
  const values: unknown[] = []
  const conditions = [clientScopeSql(scope, 'ms.client_id', values), 'ms.campaign_id IS NOT NULL', "ms.platform IN ('google', 'google_ads')"]
  const add = (column: string, value: unknown) => { values.push(value); conditions.push(`${column} $${values.length}`) }
  const ownerName = ownerClientNameSql(scope, args.clientName, 'ms.client_id', values)
  if (ownerName) conditions.push(ownerName)
  else if (args.clientName) {
    const client = await resolveScopedClient(scope, args.clientName)
    if (!client) return null
    add('ms.client_id =', client.id)
  }
  if (args.campaignId) add('ms.campaign_id =', args.campaignId)
  const load = async (exact: boolean) => {
    const queryValues = [...values]
    const queryConditions = [...conditions]
    if (args.campaignName) {
      queryValues.push(exact ? escapeLike(args.campaignName) : `%${escapeLike(args.campaignName)}%`)
      queryConditions.push(`ms.campaign_name ILIKE $${queryValues.length}`)
    }
    return queryRowsFresh<any>(`SELECT DISTINCT ON (ms.client_id, (CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END), ms.connection_id, ms.campaign_id)
      ms.id, ms.client_id, ms.platform, ms.connection_id, ms.campaign_id, ms.campaign_name, ms.campaign_type, client.name AS client_name
      FROM media_spend ms LEFT JOIN agency_clients client ON client.id = ms.client_id
      WHERE ${queryConditions.join(' AND ')}
      ORDER BY ms.client_id, (CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END), ms.connection_id, ms.campaign_id, ms.synced_at DESC NULLS LAST, ms.id ASC LIMIT 2`, queryValues)
  }
  const exact = args.campaignName ? await load(true) : []
  const rows = exact.length ? exact : await load(false)
  if (rows.length > 1) throw createError({ statusCode: 400, statusMessage: 'Multiple campaigns match; narrow the client/campaign identity' })
  const r = rows[0]
  return r ? { mediaSpendId: r.id, clientId: r.client_id, clientName: r.client_name, campaignId: r.campaign_id, campaignName: r.campaign_name, campaignType: r.campaign_type ? String(r.campaign_type).toUpperCase() : null, connectionId: r.connection_id, platform: r.platform === 'google_ads' ? 'google' : r.platform } : null
}
export async function readScopedSearchTermSnapshot(scope: MarketingReadScope, target: CampaignIdentity, startDate: string, endDate: string): Promise<SearchTermSnapshot | null> {
  requireMarketingReadPermission(scope, 'search_terms')
  if (startDate > endDate) throw new Error('Invalid reporting range')
  const values: unknown[] = [target.clientId, target.platform === 'google' ? 'google_ads' : target.platform, target.connectionId, target.campaignId, startDate, endDate]
  const predicate = clientScopeSql(scope, 'ms.client_id', values)
  const identity = `ms.client_id IS NOT DISTINCT FROM $1::uuid AND (CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END) = $2 AND ms.connection_id IS NOT DISTINCT FROM $3::uuid AND ms.campaign_id = $4 AND ${predicate}`
  const sync = await queryOneFresh<any>(`SELECT sync.id, sync.coverage, sync.coverage_reason, sync.synced_at, sync.last_attempted_at, sync.last_error, sync.source_total, sync.truncated_at_source
    FROM campaign_search_term_syncs sync JOIN media_spend ms ON ms.id = sync.media_spend_id
    WHERE ${identity} AND sync.range_start = $5 AND sync.range_end = $6
    ORDER BY CASE WHEN sync.coverage IN ('full', 'limited') AND sync.synced_at IS NOT NULL THEN 0 ELSE 1 END,
      COALESCE(sync.synced_at, sync.last_attempted_at) DESC NULLS LAST, sync.id ASC LIMIT 1`, values)
  if (!sync) return null
  values.push(sync.id)
  const rows = await queryRowsFresh<any>(`SELECT term.search_term, term.match_type, term.impressions, term.clicks, term.cost
    FROM campaign_search_term_snapshots term JOIN campaign_search_term_syncs sync ON sync.id = term.sync_id
    JOIN media_spend ms ON ms.id = sync.media_spend_id
    WHERE ${identity} AND sync.range_start = $5 AND sync.range_end = $6 AND sync.id = $${values.length}
    ORDER BY term.cost DESC, term.search_term ASC LIMIT 5000`, values)
  return { coverage: sync.coverage, coverageReason: sync.coverage_reason || null, asOf: sync.synced_at || null,
    lastAttemptedAt: sync.last_attempted_at || null, lastError: sync.last_error || null, sourceTotal: Number(sync.source_total || 0), truncatedAtSource: sync.truncated_at_source === true,
    terms: rows.map(r => ({ searchTerm: String(r.search_term), matchType: r.match_type || null, targetingStatus: null, impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0), cost: Number(r.cost || 0) })) }
}
