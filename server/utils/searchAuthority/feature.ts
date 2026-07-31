import { query, queryOne } from '~~/server/utils/db'

export const SEARCH_AUTHORITY_FEATURE = 'search_authority.core'

export interface SearchAuthorityEntitlement {
  status: string
  starts_at: Date | string
  expires_at: Date | string | null
}

interface SearchAuthorityClientEntitlement extends SearchAuthorityEntitlement {
  client_id: string
}

export interface SearchAuthorityFeatureDependencies {
  searchAuthorityEnabled?: boolean
  now?: () => Date
  queryEntitlement?: (
    clientId: string,
    featureKey: string
  ) => Promise<SearchAuthorityEntitlement | null>
  queryEntitlements?: (
    featureKey: string
  ) => Promise<SearchAuthorityClientEntitlement[]>
}

function globalRolloutEnabled(dependencies: SearchAuthorityFeatureDependencies): boolean {
  if (typeof dependencies.searchAuthorityEnabled === 'boolean') {
    return dependencies.searchAuthorityEnabled
  }
  return Boolean(useRuntimeConfig().searchAuthorityEnabled)
}

function validDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isSearchAuthorityEntitlementActive(
  entitlement: SearchAuthorityEntitlement | null,
  now = new Date()
): boolean {
  if (!entitlement || !['active', 'trial'].includes(entitlement.status)) return false

  const startsAt = validDate(entitlement.starts_at)
  if (!startsAt || startsAt.getTime() > now.getTime()) return false

  if (entitlement.expires_at === null) return true
  const expiresAt = validDate(entitlement.expires_at)
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime())
}

export async function isSearchAuthorityEnabled(
  clientId: string,
  dependencies: SearchAuthorityFeatureDependencies = {}
): Promise<boolean> {
  if (!globalRolloutEnabled(dependencies)) return false

  const queryEntitlement = dependencies.queryEntitlement
    ?? ((id: string, featureKey: string) => queryOne<SearchAuthorityEntitlement>(
      `SELECT status, starts_at, expires_at
       FROM client_feature_entitlements
       WHERE client_id = $1
         AND feature_key = $2
       LIMIT 1`,
      [id, featureKey]
    ))

  const entitlement = await queryEntitlement(clientId, SEARCH_AUTHORITY_FEATURE)
  return isSearchAuthorityEntitlementActive(
    entitlement,
    dependencies.now?.() ?? new Date()
  )
}

export async function listSearchAuthorityClientIds(
  dependencies: SearchAuthorityFeatureDependencies = {}
): Promise<string[]> {
  if (!globalRolloutEnabled(dependencies)) return []

  const queryEntitlements = dependencies.queryEntitlements
    ?? ((featureKey: string) => query<SearchAuthorityClientEntitlement>(
      `SELECT entitlement.client_id, entitlement.status,
              entitlement.starts_at, entitlement.expires_at
       FROM client_feature_entitlements entitlement
       JOIN agency_clients client ON client.id = entitlement.client_id
       WHERE entitlement.feature_key = $1
         AND client.is_active IS TRUE
       ORDER BY entitlement.client_id`,
      [featureKey]
    ))

  const now = dependencies.now?.() ?? new Date()
  const entitlements = await queryEntitlements(SEARCH_AUTHORITY_FEATURE)
  return entitlements
    .filter(entitlement => isSearchAuthorityEntitlementActive(entitlement, now))
    .map(entitlement => entitlement.client_id)
}
