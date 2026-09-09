-- Read-only synthetic CTE proof; inner query extracted from the provisioning endpoint.
WITH scenarios(name, entitlement_status, portal_enabled, from_days, until_days, site_status, member_role, ent_tenant, ent_client, ent_id, page_limit, expected) AS (VALUES
('active', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 10, TRUE),
('trial', 'trial', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 10, TRUE),
('portal disabled', 'active', FALSE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 10, FALSE),
('future entitlement', 'active', TRUE, 1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 10, FALSE),
('expired entitlement', 'active', TRUE, -1, -1, 'draft', 'editor', 't1', 'c1', 'e1', 10, FALSE),
('suspended entitlement', 'suspended', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 10, FALSE),
('inactive site', 'active', TRUE, -1, NULL::integer, 'archived', 'editor', 't1', 'c1', 'e1', 10, FALSE),
('viewer', 'active', TRUE, -1, NULL::integer, 'draft', 'viewer', 't1', 'c1', 'e1', 10, FALSE),
('foreign entitlement tenant', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't2', 'c1', 'e1', 10, FALSE),
('foreign entitlement client', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c2', 'e1', 10, FALSE),
('wrong entitlement id', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e2', 10, FALSE),
('insufficient pages', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 1, FALSE),
('zero page allowance', 'active', TRUE, -1, NULL::integer, 'draft', 'editor', 't1', 'c1', 'e1', 0, FALSE))
SELECT scenario.name, scenario.expected, COALESCE(result.allowed, FALSE) AS actual
FROM scenarios scenario
LEFT JOIN LATERAL (
 WITH page_studio_sites(id,tenant_id,client_id,entitlement_id,status) AS (
   VALUES ('s1','t1','c1','e1',scenario.site_status)
 ), page_studio_setup_proposals(tenant_id,client_id,site_id,revision,status,source,plan) AS (
   VALUES ('t1','c1','s1',1,'accepted','template','{"pages":["home","about","contact"]}'::jsonb)
 ), page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) AS (
   VALUES ('t1','c1','s1','editor',scenario.member_role)
 ), page_studio_entitlements(tenant_id,client_id,id,status,portal_creation_enabled,effective_from,effective_until,pages_per_site_limit) AS (
   VALUES (scenario.ent_tenant,scenario.ent_client,scenario.ent_id,scenario.entitlement_status,
      scenario.portal_enabled,NOW()+scenario.from_days*INTERVAL '1 day',
      NOW()+scenario.until_days*INTERVAL '1 day',scenario.page_limit)
 )
 SELECT found."canProvision" AND found.status='accepted' AND found."pagesPerSiteLimit">=1
    AND jsonb_array_length(found.plan->'pages')<=found."pagesPerSiteLimit" AS allowed
 FROM (
      SELECT site.tenant_id AS "tenantId", proposal.client_id AS "clientId",
             proposal.site_id AS "siteId", proposal.revision, proposal.status,
             proposal.source, proposal.plan,
             (site.status IN ('draft', 'active')
              AND entitlement.status IN ('trial', 'active')
              AND entitlement.portal_creation_enabled
              AND entitlement.effective_from <= NOW()
              AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS "canProvision",
             entitlement.pages_per_site_limit AS "pagesPerSiteLimit"
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site
        ON site.tenant_id = proposal.tenant_id
       AND site.client_id = proposal.client_id
       AND site.id = proposal.site_id
      JOIN page_studio_entitlements entitlement
        ON entitlement.tenant_id = site.tenant_id
       AND entitlement.client_id = site.client_id
       AND entitlement.id = site.entitlement_id
      JOIN page_studio_site_memberships membership
        ON membership.tenant_id = site.tenant_id
       AND membership.client_id = site.client_id
       AND membership.site_id = site.id
       AND membership.user_id = 'editor'
       AND membership.role = 'editor'
      WHERE proposal.client_id = 'c1' AND proposal.site_id = 's1'
        AND proposal.revision = 1
      LIMIT 1
    ) found
) result ON TRUE;
