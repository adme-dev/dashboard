import { queryRows as dbQueryRows } from '~~/server/utils/db'

type QueryRows = typeof dbQueryRows

const AD_PLATFORMS = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'twitter', 'snapchat', 'microsoft_ads']

export interface DealerFeedClientOption {
  id: string
  label: string
  name: string
  source: 'agency' | 'social'
  clientId: string | null
  isActive: boolean
  socialConnectionIds: string[]
  socialPlatforms: string[]
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  return []
}

export async function listDealerFeedClientOptions(
  deps: { queryRows?: QueryRows } = {}
): Promise<DealerFeedClientOption[]> {
  const queryRows = deps.queryRows ?? dbQueryRows
  const [clients, socialAccounts] = await Promise.all([
    queryRows<{
      id: string
      name: string
      is_active: boolean
    }>(
      `SELECT id, name, is_active
       FROM agency_clients
       WHERE is_active = true
       ORDER BY name`
    ),
    queryRows<{
      name: string
      platforms: string[]
      connection_ids: string[]
    }>(
      `WITH active_social AS (
         SELECT
           sc.id,
           sc.platform,
           COALESCE(NULLIF(TRIM(sc.account_name), ''), sc.account_id) AS account_name,
           COALESCE(
             sc.client_id,
             (SELECT ms.client_id
              FROM media_spend ms
              WHERE ms.connection_id = sc.id AND ms.client_id IS NOT NULL
              LIMIT 1)
           ) AS mapped_client_id
         FROM social_connections sc
         WHERE sc.status = 'active'
           AND sc.platform = ANY($1)
       )
       SELECT
         MIN(account_name) AS name,
         ARRAY_AGG(DISTINCT platform ORDER BY platform) AS platforms,
         ARRAY_AGG(id ORDER BY platform, id) AS connection_ids
       FROM active_social
       WHERE mapped_client_id IS NULL
       GROUP BY LOWER(TRIM(account_name))
       ORDER BY MIN(account_name)`,
      [AD_PLATFORMS]
    )
  ])

  return [
    ...clients.map(client => ({
      id: `client:${client.id}`,
      label: client.name,
      name: client.name,
      source: 'agency' as const,
      clientId: client.id,
      isActive: client.is_active,
      socialConnectionIds: [],
      socialPlatforms: []
    })),
    ...socialAccounts.map(account => ({
      id: `social:${account.name}`,
      label: `${account.name} · ad account`,
      name: account.name,
      source: 'social' as const,
      clientId: null,
      isActive: true,
      socialConnectionIds: asArray(account.connection_ids),
      socialPlatforms: asArray(account.platforms)
    }))
  ]
}
