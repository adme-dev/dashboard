-- Per-customer preview lifecycle; independent of production domain allowances.
-- Does not allocate provider resources, publish content, or enable actions.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_staging_sites (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  host_state TEXT NOT NULL DEFAULT 'reserved' CHECK (host_state IN ('reserved', 'provisioning', 'ready', 'failed', 'suspended')),
  provider_domain_id TEXT,
  provider_verified_at TIMESTAMPTZ,
  active_deployment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, client_id, site_id),
  CHECK (hostname = 'preview-' || replace(site_id::text, '-', '') || '.xeroflow.io'),
  CHECK (host_state <> 'ready' OR (provider_domain_id IS NOT NULL AND provider_verified_at IS NOT NULL)),
  FOREIGN KEY (tenant_id, client_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS page_studio_staging_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('agency', 'client')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  checkpoint_id TEXT NOT NULL,
  checkpoint_digest CHAR(64) NOT NULL CHECK (checkpoint_digest ~ '^[a-f0-9]{64}$'),
  expected_active_id UUID,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'building', 'succeeded', 'failed')),
  claim_token UUID,
  claim_until TIMESTAMPTZ,
  artifact_prefix TEXT,
  artifact_manifest_digest CHAR(64) CHECK (artifact_manifest_digest IS NULL OR artifact_manifest_digest ~ '^[a-f0-9]{64}$'),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN ('HOST_UNAVAILABLE', 'BUILD_FAILED', 'SNAPSHOT_CHANGED', 'ACCESS_INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, idempotency_key),
  CHECK ((state = 'succeeded') = (deployed_at IS NOT NULL)),
  CHECK (state <> 'succeeded' OR (artifact_prefix IS NOT NULL AND artifact_manifest_digest IS NOT NULL AND failure_code IS NULL)),
  CHECK ((state = 'failed') = (failure_code IS NOT NULL)),
  CHECK ((claim_token IS NULL) = (claim_until IS NULL)),
  FOREIGN KEY (tenant_id, client_id, site_id) REFERENCES page_studio_staging_sites(tenant_id, client_id, site_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_id, site_id, checkpoint_id) REFERENCES page_studio_checkpoints(tenant_id, client_id, site_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_id, site_id, expected_active_id) REFERENCES page_studio_staging_deployments(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_staging_in_flight
  ON page_studio_staging_deployments(tenant_id, client_id, site_id) WHERE state IN ('queued', 'building');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_page_studio_staging_active' AND conrelid = 'page_studio_staging_sites'::regclass) THEN
    ALTER TABLE page_studio_staging_sites ADD CONSTRAINT fk_page_studio_staging_active
      FOREIGN KEY (tenant_id, client_id, site_id, active_deployment_id)
      REFERENCES page_studio_staging_deployments(tenant_id, client_id, site_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION check_page_studio_staging_activation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.active_deployment_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.active_deployment_id IS DISTINCT FROM OLD.active_deployment_id) THEN
    IF NEW.host_state <> 'ready' OR NOT EXISTS (
      SELECT 1 FROM page_studio_staging_deployments deployment
      WHERE deployment.tenant_id=NEW.tenant_id AND deployment.client_id=NEW.client_id AND deployment.site_id=NEW.site_id
        AND deployment.id=NEW.active_deployment_id AND deployment.state='succeeded'
    ) THEN RAISE EXCEPTION 'STAGING_SNAPSHOT_NOT_READY'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_staging_activation_guard ON page_studio_staging_sites;
CREATE TRIGGER page_studio_staging_activation_guard BEFORE INSERT OR UPDATE ON page_studio_staging_sites
  FOR EACH ROW EXECUTE FUNCTION check_page_studio_staging_activation();
CREATE OR REPLACE FUNCTION protect_page_studio_staging_deployment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' OR
    ROW(NEW.id,NEW.tenant_id,NEW.client_id,NEW.site_id,NEW.actor_id,NEW.actor_role,NEW.idempotency_key,NEW.checkpoint_id,NEW.checkpoint_digest,NEW.expected_active_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.client_id,OLD.site_id,OLD.actor_id,OLD.actor_role,OLD.idempotency_key,OLD.checkpoint_id,OLD.checkpoint_digest,OLD.expected_active_id,OLD.created_at)
    OR (OLD.state IN ('succeeded','failed') AND NEW IS DISTINCT FROM OLD)
    OR (OLD.state='building' AND NEW.state='queued') THEN
    RAISE EXCEPTION 'STAGING_DEPLOYMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_staging_deployment_guard ON page_studio_staging_deployments;
CREATE TRIGGER page_studio_staging_deployment_guard BEFORE UPDATE OR DELETE ON page_studio_staging_deployments
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_staging_deployment();

-- One allowance shared by staging and production. Admit BEFORE contacting a
-- build Worker. Retried immutable identities reuse their original admission.
CREATE TABLE IF NOT EXISTS page_studio_build_admissions (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('staging','release')),
  resource_id TEXT NOT NULL CHECK (resource_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,client_id,site_id,kind,resource_id),
  FOREIGN KEY (tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_page_studio_build_admissions_month ON page_studio_build_admissions(tenant_id,client_id,created_at);
CREATE OR REPLACE FUNCTION admit_page_studio_build(p_tenant TEXT,p_client UUID,p_site UUID,p_kind TEXT,p_resource TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE allowance INTEGER; used BIGINT; month_start TIMESTAMPTZ; historical_at TIMESTAMPTZ;
BEGIN
  IF p_kind IS NULL OR p_resource IS NULL OR p_kind NOT IN ('staging','release') OR p_resource !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$' THEN
    RAISE EXCEPTION 'STUDIO_BUILD_ACCESS';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('page-studio-build:' || p_tenant || ':' || p_client::text,0));
  SELECT entitlement.monthly_build_limit INTO allowance FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
      AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
      AND entitlement.status IN ('trial','active') AND entitlement.effective_from<=clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
    WHERE site.tenant_id=p_tenant AND site.client_id=p_client AND site.id=p_site AND site.status IN ('draft','active')
    FOR SHARE OF client,entitlement;
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
