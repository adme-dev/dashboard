-- Native publication shares the existing monthly build ledger. No grants,
-- limits, admissions, artifacts or live pointers are changed by this migration.
-- Requires ownership migration 444 and static/runtime delivery migration 433.
BEGIN;

CREATE OR REPLACE FUNCTION admit_page_studio_build(p_tenant TEXT,p_client UUID,p_site UUID,p_kind TEXT,p_resource TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE allowance INTEGER; used BIGINT; month_start TIMESTAMPTZ; historical_at TIMESTAMPTZ;
  legacy_client UUID; native_workspace UUID;
BEGIN
  IF p_kind IS NULL OR p_resource IS NULL OR p_kind NOT IN ('staging','release') OR p_resource !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$' THEN
    RAISE EXCEPTION 'STUDIO_BUILD_ACCESS';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('page-studio-build:' || p_tenant || ':' || p_client::text,0));
  -- The business scope can now belong to a native workspace. Preserve the
  -- legacy active-client check; native release admission is explicitly gated.
  SELECT owner.agency_client_id,owner.workspace_id INTO legacy_client,native_workspace
    FROM page_studio_sites site JOIN page_studio_business_owners owner ON owner.id=site.client_id
    WHERE site.tenant_id=p_tenant AND site.client_id=p_client AND site.id=p_site
    FOR SHARE OF owner;
  IF legacy_client IS NOT NULL THEN
    PERFORM id FROM agency_clients WHERE id=legacy_client AND is_active=TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STUDIO_BUILD_ACCESS'; END IF;
  ELSIF native_workspace IS NOT NULL AND p_kind='release' THEN
    PERFORM id FROM page_studio_customer_workspaces WHERE id=native_workspace AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STUDIO_BUILD_ACCESS'; END IF;
  ELSE
    RAISE EXCEPTION 'STUDIO_BUILD_ACCESS';
  END IF;
  SELECT entitlement.monthly_build_limit INTO allowance FROM page_studio_sites site
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
      AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
      AND entitlement.status IN ('trial','active') AND entitlement.effective_from<=clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
    WHERE site.tenant_id=p_tenant AND site.client_id=p_client AND site.id=p_site AND site.status IN ('draft','active')
      AND (legacy_client IS NOT NULL OR (
        site.delivery_mode='static' AND entitlement.status='active'
        AND entitlement.plan_key<>'customer_preview_v1'
        AND entitlement.active_site_limit>0 AND entitlement.custom_domain_limit>0
        AND entitlement.plan_metadata->'publishingEnabled'='true'::jsonb))
    FOR SHARE OF entitlement;
  IF allowance IS NULL THEN RAISE EXCEPTION 'STUDIO_BUILD_ACCESS'; END IF;
  IF EXISTS (SELECT 1 FROM page_studio_build_admissions WHERE tenant_id=p_tenant AND client_id=p_client
    AND site_id=p_site AND kind=p_kind AND resource_id=p_resource) THEN RETURN; END IF;
  -- A retry of a pre-ledger build has already consumed its historical slot.
  -- Preserve its original month instead of charging it again on migration.
  IF p_kind='release' THEN
    SELECT created_at INTO historical_at FROM page_studio_builds WHERE tenant_id=p_tenant
      AND client_id=p_client AND site_id=p_site AND id=p_resource;
  ELSE
    SELECT created_at INTO historical_at FROM page_studio_staging_deployments WHERE tenant_id=p_tenant
      AND client_id=p_client AND site_id=p_site AND id::text=p_resource;
  END IF;
  IF historical_at IS NOT NULL THEN
    INSERT INTO page_studio_build_admissions(tenant_id,client_id,site_id,kind,resource_id,created_at)
      VALUES(p_tenant,p_client,p_site,p_kind,p_resource,historical_at);
    RETURN;
  END IF;
  month_start := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT COUNT(*) INTO used FROM (
    SELECT 1 FROM page_studio_build_admissions WHERE tenant_id=p_tenant AND client_id=p_client AND created_at>=month_start
    UNION ALL
    SELECT 1 FROM page_studio_builds build WHERE build.tenant_id=p_tenant AND build.client_id=p_client AND build.created_at>=month_start
      AND NOT EXISTS (SELECT 1 FROM page_studio_build_admissions admission WHERE admission.tenant_id=build.tenant_id
        AND admission.client_id=build.client_id AND admission.site_id=build.site_id AND admission.kind='release' AND admission.resource_id=build.id)
    UNION ALL
    SELECT 1 FROM page_studio_staging_deployments deployment WHERE deployment.tenant_id=p_tenant AND deployment.client_id=p_client AND deployment.created_at>=month_start
      AND NOT EXISTS (SELECT 1 FROM page_studio_build_admissions admission WHERE admission.tenant_id=deployment.tenant_id
        AND admission.client_id=deployment.client_id AND admission.site_id=deployment.site_id AND admission.kind='staging' AND admission.resource_id=deployment.id::text)
  ) usage;
  IF used>=allowance THEN RAISE EXCEPTION 'STUDIO_BUILD_LIMIT'; END IF;
  INSERT INTO page_studio_build_admissions(tenant_id,client_id,site_id,kind,resource_id) VALUES(p_tenant,p_client,p_site,p_kind,p_resource);
END $$;
COMMIT;
