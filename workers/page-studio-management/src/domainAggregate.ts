import type { DomainDatabase } from './domainAttachment'

const MAX_OPERATION_ROWS = 200
export async function listAgencyPageStudioDomains(tenantId: string, db: DomainDatabase) {
  return (await db.query(`
    SELECT domain.id, site.id::text AS "siteId",
           client.name AS "clientName", site.name AS "siteName",
           domain.normalized_hostname AS hostname,
           'production'::text AS environment,
           domain.hostname_status AS "hostnameStatus",
           domain.dns_status AS "dnsStatus", domain.tls_status AS "tlsStatus",
           domain.lifecycle_state AS "lifecycleState",
           domain.lifecycle_state AS status,
           domain.failure_summary AS "failureSummary",
           domain.verified_at AS "verifiedAt", domain.activated_at AS "activatedAt",
           domain.updated_at AS "updatedAt"
    FROM page_studio_domains domain
    JOIN page_studio_sites site
      ON site.tenant_id = domain.tenant_id
     AND site.client_id = domain.client_id
     AND site.id = domain.site_id
    JOIN agency_clients client ON client.id = domain.client_id
    WHERE domain.tenant_id = $1
    ORDER BY domain.updated_at DESC
    LIMIT $2
  `, [tenantId, MAX_OPERATION_ROWS])).rows
}

export async function listPortalPageStudioDomains(clientId: string, userId: string, db: DomainDatabase) {
  return (await db.query(`
    SELECT domain.id, site.id AS "siteId", site.name AS "siteName",
           domain.normalized_hostname AS hostname,
           domain.hostname_status AS "hostnameStatus",
           domain.dns_status AS "dnsStatus", domain.tls_status AS "tlsStatus",
           domain.lifecycle_state AS "lifecycleState",
           domain.failure_summary AS "failureSummary",
           domain.verified_at AS "verifiedAt", domain.activated_at AS "activatedAt",
           domain.updated_at AS "updatedAt"
    FROM page_studio_domains domain
    JOIN page_studio_sites site
      ON site.tenant_id = domain.tenant_id
     AND site.client_id = domain.client_id
     AND site.id = domain.site_id
    JOIN page_studio_site_memberships membership
      ON membership.tenant_id = site.tenant_id
     AND membership.client_id = site.client_id
     AND membership.site_id = site.id
     AND membership.user_id = $2
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN client_users portal_user ON portal_user.id = membership.user_id AND portal_user.client_id = site.client_id
     AND portal_user.status = 'active' AND portal_user.role IN ('admin','manager','viewer')
    JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
     AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
    WHERE domain.client_id = $1 AND membership.role IN ('editor','viewer')
      AND site.status IN ('draft','active') AND entitlement.status IN ('trial','active')
      AND entitlement.effective_from <= NOW()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())
      AND entitlement.custom_domain_limit > 0 AND domain.lifecycle_state <> 'detached'
    ORDER BY domain.updated_at DESC
    LIMIT $3
  `, [clientId, userId, MAX_OPERATION_ROWS])).rows
}
