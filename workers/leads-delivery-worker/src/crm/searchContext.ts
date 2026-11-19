import { queryOne, queryRows } from '../db'

export interface TrustedCrmSystemContext {
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: 'system'
  actorId: string
  surface: 'trusted_system'
  permissionSet: readonly []
  visibility: { ownerScoped: false }
  trustedSystem: { purpose: 'lead_crm_promotion' }
  /** 'dormant' when the crm_search_* schema is absent; never use the scope for search. */
  searchScope?: 'active' | 'dormant'
}

// Mirrors server/utils/crm/searchDormancy.ts (the Worker cannot import Nitro utils).
export const CRM_SEARCH_DORMANT_SCOPE_ID = 'crm-search-dormant'
let dormancyLogged = false

function isCrmSearchSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown, message?: unknown }
  return code === '42P01' && typeof message === 'string' && /\bcrm_search_[a-z_]+\b/u.test(message)
}

export type CrmRecordAccessContext = TrustedCrmSystemContext

export async function resolveTrustedCrmSystemContext(
  input: { clientId: string, purpose: 'lead_crm_promotion' }
): Promise<TrustedCrmSystemContext> {
  const client = await queryOne<{ id: string }>(
    `SELECT id::text AS id
       FROM agency_clients
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1`,
    [input.clientId]
  )
  if (!client) throw new Error('Trusted CRM client is unavailable')

  let organisationScopeId: string
  let searchScope: 'active' | 'dormant' = 'active'
  try {
    const scopes = await queryRows<{ id: string }>(
      `SELECT id::text AS id
         FROM crm_search_organisation_scopes
        WHERE is_primary = TRUE AND is_active = TRUE
        ORDER BY id
        LIMIT 2`
    )
    if (scopes.length !== 1) throw new Error('Trusted CRM organisation scope is unavailable')
    organisationScopeId = scopes[0]!.id
  } catch (error) {
    // CRM search is intentionally dormant until its signed release applies the
    // crm_search_* schema; lead promotion must not depend on it.
    if (!isCrmSearchSchemaMissing(error) || process.env.CRM_SEARCH_PROVIDER_APIS_ENABLED === 'true') throw error
    if (!dormancyLogged) {
      dormancyLogged = true
      console.info({ event: 'crm_search_scope_dormant', purpose: input.purpose })
    }
    organisationScopeId = CRM_SEARCH_DORMANT_SCOPE_ID
    searchScope = 'dormant'
  }

  return {
    organisationScopeId,
    clientId: client.id,
    correlationId: crypto.randomUUID(),
    actorType: 'system',
    actorId: 'trusted-system:lead_crm_promotion',
    surface: 'trusted_system',
    permissionSet: [],
    visibility: { ownerScoped: false },
    trustedSystem: { purpose: input.purpose },
    searchScope
  }
}
