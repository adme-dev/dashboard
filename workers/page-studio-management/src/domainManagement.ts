import { DomainManagementRequestSchema, DomainAggregateRecordSchema, DomainListSchema, DomainIdentitySchema, DomainVerificationSchema, DomainErrorStatuses, domainPublicMessage, type DomainManagementRequest } from '../../../shared/pageStudio/domainManagement'
import { SYSTEM_ROLE_PERMISSIONS, isReadOnlyRole } from '../../../server/utils/permissions'
import type { DomainActor, DomainDatabase, DomainTransaction } from './domainAttachment'
import { domainFailure, PageStudioDomainAttachmentError } from './domainAttachmentProvider'
import { requirePortalDomainAuthority } from './portalDomainAuthority'
import { readPortalDomainConfiguration, projectPortalDomain } from './portalDomains'
import { attachPageStudioDomain, refreshPageStudioDomain } from './domainConfiguration'
import { listAgencyPageStudioDomains, listPortalPageStudioDomains } from './domainAggregate'

export async function agencyAuthority(db: DomainDatabase, actorId: string, permission: 'PAGE_STUDIO_VIEW' | 'PAGE_STUDIO_DOMAINS' | 'PAGE_STUDIO_APPROVE') {
  const staff = (await db.query<{ user_role: string, custom_role_id: string | null }>('SELECT user_role,custom_role_id FROM team_members WHERE id=$1 AND is_active=TRUE FOR SHARE', [actorId])).rows[0]
  if (!staff) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
  const policy = (await db.query<{ id: string, is_read_only: boolean }>(`SELECT id,is_read_only FROM custom_roles WHERE ${staff.custom_role_id ? 'id=$1' : 'slug=$1 AND is_system=TRUE'} FOR SHARE`, [staff.custom_role_id ?? staff.user_role])).rows[0]
  if (staff.custom_role_id && !policy) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
  const groups = policy ? (await db.query<{ permission_group: string }>('SELECT permission_group FROM role_permission_groups WHERE role_id=$1 FOR SHARE', [policy.id])).rows.map(row => row.permission_group) : SYSTEM_ROLE_PERMISSIONS[staff.user_role] ?? []
  const canManage = Boolean(policy) && groups.includes('PAGE_STUDIO_EDIT') && !isReadOnlyRole(staff.user_role) && policy?.is_read_only !== true
  if (!groups.includes(permission) || (permission === 'PAGE_STUDIO_DOMAINS' && (isReadOnlyRole(staff.user_role) || policy?.is_read_only === true))) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
  return canManage
}
const serializeDates = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]))
export async function executeDomainManagement(request: DomainManagementRequest, env: Record<string, unknown>, transaction: DomainTransaction) {
  const { actor } = request
  if (request.operation === 'aggregate') {
    return transaction(async (db) => {
      if (actor.kind === 'agency') await agencyAuthority(db, actor.actorId, 'PAGE_STUDIO_DOMAINS')
      const rows = actor.kind === 'agency' ? await listAgencyPageStudioDomains(actor.tenantId, db) : await listPortalPageStudioDomains(actor.clientId, actor.actorId, db)
      return rows.map(row => DomainAggregateRecordSchema.parse(serializeDates(row)))
    })
  }
  if (request.operation === 'list') {
    if (actor.kind === 'portal') return DomainListSchema.parse(await readPortalDomainConfiguration({ ...actor, siteId: request.siteId }, transaction))
    return transaction(async (db) => {
      const canManage = await agencyAuthority(db, actor.actorId, 'PAGE_STUDIO_VIEW')
      const site = await db.query(`SELECT site.id FROM page_studio_sites site
        JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
        JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
        WHERE site.id=$1 AND site.tenant_id=$2 AND site.status IN ('draft','active') AND entitlement.status IN ('trial','active')
        AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
        AND entitlement.custom_domain_limit>0 FOR SHARE OF site,client,entitlement`, [request.siteId, actor.tenantId])
      if (site.rows.length !== 1) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
      const rows = await db.query(`SELECT id,normalized_hostname,lifecycle_state,hostname_status,dns_status,tls_status,ownership_validation,certificate_validation FROM page_studio_domains WHERE tenant_id=$1 AND site_id=$2 AND lifecycle_state<>'detached' ORDER BY updated_at DESC LIMIT 200`, [actor.tenantId, request.siteId])
      return DomainListSchema.parse({ siteId: request.siteId, canManage, domains: rows.rows.map(projectPortalDomain) })
    })
  }
  const scoped: DomainActor = actor.kind === 'agency'
    ? { ...actor, siteId: request.siteId }
    : await transaction(async (db) => {
        const scope = await requirePortalDomainAuthority(db, { ...actor, siteId: request.siteId }, true)
        return { ...actor, tenantId: scope.tenantId, siteId: request.siteId }
      })
  if (request.operation === 'attach') return DomainIdentitySchema.parse(await attachPageStudioDomain({ ...scoped, hostname: request.hostname, env }, transaction))
  const value = await refreshPageStudioDomain({ ...scoped, domainId: request.domainId, env }, transaction)
  // Customer mutation response reveals only its retained identity, never provider internals.
  if (actor.kind === 'portal') return DomainIdentitySchema.parse({ id: value.id })
  return DomainVerificationSchema.parse({ ...value, ownershipValidation: { ...projectPortalDomain({ ownership_validation: value.ownershipValidation }).ownershipValidation, providerConfigured: value.ownershipValidation.providerConfigured, dnsVerified: value.ownershipValidation.dnsVerified },
    certificateValidation: projectPortalDomain({ certificate_validation: value.certificateValidation }).certificateValidation })
}
export async function handleDomainManagement(input: unknown, env: Record<string, unknown>, transaction: DomainTransaction) {
  const rejected = (code: string) => ({ ok: false as const, error: { code, statusCode: DomainErrorStatuses[code], message: domainPublicMessage(code) } })
  const parsed = DomainManagementRequestSchema.safeParse(input)
  if (!parsed.success) return rejected('DOMAIN_INVALID')
  const environment = env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (!['staging', 'production'].includes(String(environment)) || environment !== parsed.data.expectedEnvironment || !(env.HYPERDRIVE_FRESH as { connectionString?: string } | undefined)?.connectionString) return rejected('DOMAIN_SERVICE_UNAVAILABLE')
  try {
    const value = await executeDomainManagement(parsed.data, env, transaction)
    return { ok: true as const, operation: parsed.data.operation, siteId: 'siteId' in parsed.data ? parsed.data.siteId : null, environment,
      actorKind: parsed.data.actor.kind, scopeId: parsed.data.actor.kind === 'agency' ? parsed.data.actor.tenantId : parsed.data.actor.clientId, value }
  } catch (error) {
    if (error instanceof PageStudioDomainAttachmentError && Object.hasOwn(DomainErrorStatuses, error.code) && DomainErrorStatuses[error.code] === error.statusCode) return rejected(error.code)
    if (error && typeof error === 'object' && 'code' in error && ['42703', '42P01'].includes(String(error.code))) return rejected('DOMAIN_SCHEMA_PENDING')
    console.error(JSON.stringify({ event: 'page_studio_domain_management_failure', operation: parsed.data.operation, environment }))
    return rejected('DOMAIN_SERVICE_UNAVAILABLE')
  }
}
