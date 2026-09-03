import { queryRows } from '~~/server/utils/db'

const MAX_OPERATION_ROWS = 200

export async function listAgencyPageStudioReviews(tenantId: string) {
  return queryRows(`
    SELECT version.id AS "versionId", site.id AS "siteId",
           client.name AS "clientName", site.name AS "siteName",
           version.summary, version.status,
           version.submitted_at AS "submittedAt",
           review.decision, review.comment,
           reviewer.name AS "reviewerName",
           review.decided_at AS "decidedAt"
    FROM page_studio_versions version
    JOIN page_studio_sites site
      ON site.tenant_id = version.tenant_id
     AND site.client_id = version.client_id
     AND site.id = version.site_id
    JOIN agency_clients client ON client.id = version.client_id
    LEFT JOIN LATERAL (
      SELECT candidate.decision, candidate.comment, candidate.reviewer_id, candidate.decided_at
      FROM page_studio_reviews candidate
      WHERE candidate.tenant_id = version.tenant_id
        AND candidate.client_id = version.client_id
        AND candidate.site_id = version.site_id
        AND candidate.version_id = version.id
      ORDER BY candidate.decided_at DESC
      LIMIT 1
    ) review ON TRUE
    LEFT JOIN team_members reviewer ON reviewer.id = review.reviewer_id
    WHERE version.tenant_id = $1
      AND (version.status = 'in_review' OR review.decision IS NOT NULL)
    ORDER BY COALESCE(review.decided_at, version.submitted_at, version.updated_at) DESC
    LIMIT $2
  `, [tenantId, MAX_OPERATION_ROWS])
}

export async function listAgencyPageStudioReleases(tenantId: string) {
  return queryRows(`
    SELECT release.id, site.id::text AS "siteId",
           client.name AS "clientName", site.name AS "siteName",
           release.environment, release.normalized_hostname AS hostname,
           release.build_id AS "buildId", build.state AS "buildState",
           publisher.name AS "publishedBy", release.published_at AS "publishedAt",
           release.published_at AS "createdAt",
           (pointer.active_release_id = release.id) AS active,
           CASE WHEN pointer.active_release_id = release.id THEN 'active' ELSE 'historical' END AS status
    FROM page_studio_releases release
    JOIN page_studio_sites site
      ON site.tenant_id = release.tenant_id
     AND site.client_id = release.client_id
     AND site.id = release.site_id
    JOIN agency_clients client ON client.id = release.client_id
    JOIN page_studio_builds build
      ON build.tenant_id = release.tenant_id
     AND build.client_id = release.client_id
     AND build.site_id = release.site_id
     AND build.id = release.build_id
    LEFT JOIN page_studio_release_pointers pointer
      ON pointer.tenant_id = release.tenant_id
     AND pointer.client_id = release.client_id
     AND pointer.site_id = release.site_id
     AND pointer.environment = release.environment
     AND pointer.normalized_hostname = release.normalized_hostname
    LEFT JOIN team_members publisher ON publisher.id = release.published_by
    WHERE release.tenant_id = $1
    ORDER BY release.published_at DESC
    LIMIT $2
  `, [tenantId, MAX_OPERATION_ROWS])
}

export async function listAgencyPageStudioDomains(tenantId: string) {
  return queryRows(`
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
  `, [tenantId, MAX_OPERATION_ROWS])
}

export async function listAgencyPageStudioSubscriptions(tenantId: string) {
  return queryRows(`
    SELECT entitlement.id, entitlement.client_id::text AS "clientId",
           client.name AS "clientName",
           entitlement.plan_key AS "planKey", entitlement.status,
           entitlement.active_site_limit AS "siteLimit",
           entitlement.pages_per_site_limit AS "pagesPerSiteLimit",
           entitlement.custom_domain_limit AS "domainLimit",
           entitlement.monthly_build_limit AS "buildLimit",
           COUNT(DISTINCT site.id)::integer AS "siteCount",
           COUNT(DISTINCT domain.id)::integer AS "domainCount",
           entitlement.effective_from AS "effectiveFrom",
           entitlement.effective_until AS "effectiveUntil"
    FROM page_studio_entitlements entitlement
    JOIN agency_clients client ON client.id = entitlement.client_id
    LEFT JOIN page_studio_sites site
      ON site.tenant_id = entitlement.tenant_id
     AND site.client_id = entitlement.client_id
     AND site.entitlement_id = entitlement.id
    LEFT JOIN page_studio_domains domain
      ON domain.tenant_id = site.tenant_id
     AND domain.client_id = site.client_id
     AND domain.site_id = site.id
     AND domain.lifecycle_state <> 'detached'
    WHERE entitlement.tenant_id = $1
    GROUP BY entitlement.id, client.name
    ORDER BY entitlement.updated_at DESC
    LIMIT $2
  `, [tenantId, MAX_OPERATION_ROWS])
}

export async function listPortalPageStudioReleases(clientId: string, userId: string) {
  return queryRows(`
    SELECT release.id, site.name AS "siteName", release.environment,
           release.normalized_hostname AS hostname,
           release.build_id AS "buildId", build.state AS "buildState",
           release.published_at AS "publishedAt",
           (pointer.active_release_id = release.id) AS active
    FROM page_studio_releases release
    JOIN page_studio_sites site
      ON site.tenant_id = release.tenant_id
     AND site.client_id = release.client_id
     AND site.id = release.site_id
    JOIN page_studio_site_memberships membership
      ON membership.tenant_id = site.tenant_id
     AND membership.client_id = site.client_id
     AND membership.site_id = site.id
     AND membership.user_id = $2
    JOIN page_studio_builds build
      ON build.tenant_id = release.tenant_id
     AND build.client_id = release.client_id
     AND build.site_id = release.site_id
     AND build.id = release.build_id
    LEFT JOIN page_studio_release_pointers pointer
      ON pointer.tenant_id = release.tenant_id
     AND pointer.client_id = release.client_id
     AND pointer.site_id = release.site_id
     AND pointer.environment = release.environment
     AND pointer.normalized_hostname = release.normalized_hostname
    WHERE release.client_id = $1
    ORDER BY release.published_at DESC
    LIMIT $3
  `, [clientId, userId, MAX_OPERATION_ROWS])
}

export async function listPortalPageStudioDomains(clientId: string, userId: string) {
  return queryRows(`
    SELECT domain.id, site.name AS "siteName",
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
    WHERE domain.client_id = $1
    ORDER BY domain.updated_at DESC
    LIMIT $3
  `, [clientId, userId, MAX_OPERATION_ROWS])
}
