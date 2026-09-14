import { z } from 'zod'
import type { DomainDatabase } from './domainAttachment'
import { domainFailure } from './domainAttachmentProvider'

export interface PortalDomainActor {
  actorId: string
  clientId: string
  siteId: string
  tenantId?: string
}
export interface PortalDomainScope {
  tenantId: string
  clientId: string
  customDomainLimit: number
  canManage: boolean
}
/** The selected client and exact membership determine the tenant, never a request body. */
export async function requirePortalDomainAuthority(db: DomainDatabase, input: PortalDomainActor, writing: boolean): Promise<PortalDomainScope> {
  if (![input.actorId, input.clientId, input.siteId].every(value => z.string().uuid().safeParse(value).success))
    throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
  const result = await db.query<PortalDomainScope>(`
    SELECT site.tenant_id AS "tenantId", site.client_id::text AS "clientId",
           entitlement.custom_domain_limit AS "customDomainLimit",
           (portal_user.role IN ('admin','manager') AND membership.role = 'editor') AS "canManage"
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN client_users portal_user ON portal_user.id = $3 AND portal_user.client_id = site.client_id
     AND portal_user.status = 'active' AND portal_user.role IN ('admin','manager','viewer')
    JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
     AND membership.client_id = site.client_id AND membership.site_id = site.id
     AND membership.user_id = portal_user.id AND membership.role IN ('viewer','editor')
    JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
     AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
    WHERE site.client_id = $1 AND site.id = $2 AND ($4::text IS NULL OR site.tenant_id = $4)
     AND site.status IN ('draft','active') AND entitlement.status IN ('trial','active')
     AND entitlement.effective_from <= clock_timestamp()
     AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())
     AND entitlement.custom_domain_limit > 0
    FOR SHARE OF site, client, portal_user, membership, entitlement
  `, [input.clientId, input.siteId, input.actorId, input.tenantId ?? null])
  const row = result.rows[0]
  if (result.rows.length !== 1 || !row || row.clientId !== input.clientId || (writing && row.canManage !== true))
    throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
  return row
}
