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

  const scopes = await queryRows<{ id: string }>(
    `SELECT id::text AS id
       FROM crm_search_organisation_scopes
      WHERE is_primary = TRUE AND is_active = TRUE
      ORDER BY id
      LIMIT 2`
  )
  if (scopes.length !== 1) throw new Error('Trusted CRM organisation scope is unavailable')
  const scope = scopes[0]!

  return {
    organisationScopeId: scope.id,
    clientId: client.id,
    correlationId: crypto.randomUUID(),
    actorType: 'system',
    actorId: 'trusted-system:lead_crm_promotion',
    surface: 'trusted_system',
    permissionSet: [],
    visibility: { ownerScoped: false },
    trustedSystem: { purpose: input.purpose }
  }
}
