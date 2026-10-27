import { queryRowsFresh } from '~~/server/utils/db'
import { escapeLike } from '../toolContext'
import { clientScopeSql, requireMarketingReadPermission, type MarketingReadScope } from './readScope'
import { resolveScopedClient, ownerClientNameSql } from './clientReads'
import { leadSourceForPlatformSql } from '~~/server/utils/leads/portalAnalytics'
import type { AdBreakdownArgs } from '../tools/adBreakdown'

export type CampaignIdentity = Readonly<{ clientId: string | null; platform: string; connectionId: string | null; campaignId: string; mediaSpendId?: string; campaignName?: string; clientName?: string | null; campaignType?: string | null }>
export type SnapshotCoverage = { selectedTargetCount: number; withSnapshotCount: number; missingTargetCount: number; missingTargets: CampaignIdentity[] }
export function campaignIdentityKey(row: CampaignIdentity): string {
  return JSON.stringify([row.clientId, row.platform === 'google' ? 'google_ads' : row.platform, row.connectionId, row.campaignId])
}
export async function selectScopedAdTargets(scope: MarketingReadScope, args: AdBreakdownArgs) {
  requireMarketingReadPermission(scope, 'ads')
  const values: unknown[] = []
  const conditions = [clientScopeSql(scope, 'ms.client_id', values), 'ms.campaign_id IS NOT NULL']
  const add = (column: string, value: unknown) => { values.push(value); conditions.push(`${column} $${values.length}`) }
  const ownerName = ownerClientNameSql(scope, args.clientName, 'ms.client_id', values)
  if (ownerName) conditions.push(ownerName)
  else if (args.clientName) {
    const client = await resolveScopedClient(scope, args.clientName)
    if (!client) return { targets: [], truncatedAtSource: false }
    add('ms.client_id =', client.id)
  }
  if (args.campaignId) add('ms.campaign_id =', args.campaignId)
  if (args.campaignName) add('ms.campaign_name ILIKE', `%${escapeLike(args.campaignName)}%`)
  if (args.platform === 'google') conditions.push("ms.platform IN ('google', 'google_ads')")
  else if (args.platform) add('ms.platform =', args.platform)
  const rows = await queryRowsFresh<any>(`SELECT DISTINCT ON (ms.client_id, (CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END), ms.connection_id, ms.campaign_id)
    ms.id, ms.client_id, ms.platform, ms.connection_id, ms.campaign_id, ms.campaign_name, ms.campaign_type, client.name AS client_name
    FROM media_spend ms LEFT JOIN agency_clients client ON client.id = ms.client_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ms.client_id, (CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END), ms.connection_id, ms.campaign_id, ms.synced_at DESC NULLS LAST, ms.id ASC LIMIT 21`, values)
  return { targets: rows.slice(0, 20).map((r): CampaignIdentity => ({ clientId: r.client_id, platform: r.platform, connectionId: r.connection_id, campaignId: r.campaign_id, mediaSpendId: r.id, campaignName: r.campaign_name, campaignType: r.campaign_type, clientName: r.client_name })), truncatedAtSource: rows.length > 20 }
}
/** Revalidates the entire selected identity against current canonical ownership, across ALL months. */
export async function readAdSnapshots(scope: MarketingReadScope, targets: CampaignIdentity[], startDate: string, endDate: string) {
  requireMarketingReadPermission(scope, 'ads')
  if (startDate > endDate) throw new Error('Invalid reporting range')
  const values: unknown[] = [startDate, endDate, JSON.stringify(targets.map(t => ({ client_id: t.clientId, platform: t.platform === 'google' ? 'google_ads' : t.platform, connection_id: t.connectionId, campaign_id: t.campaignId })))]
  const predicate = clientScopeSql(scope, 'ms.client_id', values)
  const rows = targets.length ? await queryRowsFresh<any>(`WITH scoped_media AS (
      SELECT ms.*, CASE WHEN ms.platform = 'google' THEN 'google_ads' ELSE ms.platform END AS reporting_platform FROM media_spend ms WHERE ${predicate}
    ), selected AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS t(client_id uuid, platform text, connection_id uuid, campaign_id text)), evidence AS (
      SELECT DISTINCT ON (ms.client_id, ms.reporting_platform, ms.connection_id, ms.campaign_id, aps.ad_id)
        aps.*, ms.client_id, ms.reporting_platform AS platform, ms.connection_id, ms.campaign_id, ms.campaign_name
      FROM ad_performance_snapshots aps JOIN scoped_media ms ON ms.id = aps.media_spend_id
      JOIN selected ON ms.client_id IS NOT DISTINCT FROM selected.client_id AND ms.reporting_platform = selected.platform
        AND ms.connection_id IS NOT DISTINCT FROM selected.connection_id AND ms.campaign_id = selected.campaign_id
      WHERE aps.range_start = $1 AND aps.range_end = $2
      ORDER BY ms.client_id, ms.reporting_platform, ms.connection_id, ms.campaign_id, aps.ad_id, aps.synced_at DESC NULLS LAST, aps.id ASC
    )
    SELECT aps.*, client.name AS client_name, COALESCE(aps.creative_id, cc.creative_id) AS creative_id,
      COALESCE(cc.title, cc.ad_name) AS creative_name, la.lead_count, la.account_ambiguous
    FROM evidence aps JOIN scoped_media ms ON ms.id = aps.media_spend_id
    LEFT JOIN agency_clients client ON client.id = ms.client_id
    LEFT JOIN LATERAL (SELECT creative_id, title, ad_name FROM campaign_creatives
      WHERE media_spend_id = ms.id AND ad_id = aps.ad_id ORDER BY synced_at DESC, id ASC LIMIT 1) cc ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT l.id)::int AS lead_count,
        BOOL_OR((SELECT COUNT(DISTINCT COALESCE(other.connection_id::text, 'unlinked')) > 1 FROM scoped_media other
          WHERE other.client_id = l.client_id AND l.source = ${leadSourceForPlatformSql('other')}
            AND (other.campaign_id = l.campaign_id OR (other.campaign_id IS NULL AND other.campaign_name = l.campaign_name)))) AS account_ambiguous
      FROM leads l WHERE l.deleted_at IS NULL AND l.is_test = false
        AND l.client_id = ms.client_id AND l.source = ${leadSourceForPlatformSql('ms')}
        AND l.campaign_id = ms.campaign_id AND l.ad_id = aps.ad_id
        AND l.submitted_at >= aps.range_start AND l.submitted_at < aps.range_end + INTERVAL '1 day'
    ) la ON TRUE`, values) : []
  const present = new Set(rows.map(row => campaignIdentityKey({ clientId: row.client_id, platform: row.platform, connectionId: row.connection_id, campaignId: row.campaign_id })))
  const missingTargets = targets.filter(t => !present.has(campaignIdentityKey(t)))
  const snapshotCoverage: SnapshotCoverage = { selectedTargetCount: targets.length, withSnapshotCount: targets.length - missingTargets.length, missingTargetCount: missingTargets.length, missingTargets }
  return { rows, snapshotCoverage }
}
