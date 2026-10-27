import { queryRowsFresh } from '~~/server/utils/db'
import { clientScopeSql, requireMarketingReadPermission, type MarketingReadScope } from './readScope'
import { escapeLike } from '../toolContext'
import type { AdCreativeTextArgs, AdCreativeTextRow } from '../tools/adCreativeText'
function campaignNameLikePattern(value: string) { return `%${value.trim().split(/\s+/).filter(Boolean).map(escapeLike).join('%')}%` }
function scopeConditions(scope: MarketingReadScope, args: AdCreativeTextArgs): { conditions: string[], values: unknown[] } {
  const conditions = [`ms.platform = $1`]
  const values: unknown[] = [args.platform === 'google' ? 'google_ads' : 'meta']
  const add = (condition: string, value: unknown) => {
    values.push(value)
    conditions.push(condition.replace('?', `$${values.length}`))
  }
  if (args.clientId) add('ms.client_id = ?::uuid', args.clientId)
  if (args.campaignId) add('ms.campaign_id = ?', args.campaignId)
  if (args.campaignName) add(`ms.campaign_name ILIKE ? ESCAPE '\\'`, campaignNameLikePattern(args.campaignName))
  conditions.push(clientScopeSql(scope, 'ms.client_id', values))
  return { conditions, values }
}

export async function readCreativeText(scope: MarketingReadScope, args: AdCreativeTextArgs) {
  requireMarketingReadPermission(scope, 'creatives')
  const { conditions, values } = scopeConditions(scope, args)
  values.push(501)
  return await queryRowsFresh<AdCreativeTextRow>(
    `SELECT DISTINCT ON (ms.client_id, ms.platform, ms.connection_id, COALESCE(cc.ad_id, cc.creative_id), ms.campaign_id)
            cc.ad_id, cc.ad_name, cc.creative_id, cc.title, cc.body,
            ms.campaign_id, ms.campaign_name, ms.platform,
            aps.effective_status, aps.last_served_date::text,
            GREATEST(cc.synced_at, aps.synced_at)::text AS synced_at
       FROM campaign_creatives cc
       JOIN media_spend ms ON ms.id = cc.media_spend_id
       LEFT JOIN LATERAL (
         SELECT NULL::text AS effective_status, perf.last_served_date, perf.synced_at
           FROM ad_performance_snapshots perf
          WHERE perf.media_spend_id = ms.id
            AND perf.ad_id = COALESCE(cc.ad_id, cc.creative_id)
          ORDER BY perf.synced_at DESC
          LIMIT 1
       ) aps ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY ms.client_id, ms.platform, ms.connection_id, COALESCE(cc.ad_id, cc.creative_id), ms.campaign_id, cc.synced_at DESC
      LIMIT $${values.length}`,
    values
  )
}
export async function findScopedUnsyncedCreatives(scope: MarketingReadScope, args: AdCreativeTextArgs) {
requireMarketingReadPermission(scope, 'creatives')
  const { conditions, values } = scopeConditions(scope, args)
  values.push(20)
  const rows = await queryRowsFresh<{ id: string }>(
    `SELECT DISTINCT ON (ms.client_id, ms.platform, ms.connection_id, ms.campaign_id) ms.id
       FROM media_spend ms
      WHERE ${conditions.join(' AND ')}
        AND ms.connection_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM campaign_creatives cc WHERE cc.media_spend_id = ms.id)
      ORDER BY ms.client_id, ms.platform, ms.connection_id, ms.campaign_id, ms.synced_at DESC NULLS LAST, ms.id ASC
      LIMIT $${values.length}`,
    values
  )
  return rows.map(r => r.id)
}
