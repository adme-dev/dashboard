-- 402: XeroFlow Page Studio authoritative control plane.
-- Additive and idempotent. Page Studio services never receive direct database access.

BEGIN;

CREATE TABLE IF NOT EXISTS page_studio_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  plan_key TEXT NOT NULL DEFAULT 'page_studio_limited',
  active_site_limit INTEGER NOT NULL DEFAULT 1 CHECK (active_site_limit >= 0),
  pages_per_site_limit INTEGER NOT NULL DEFAULT 10 CHECK (pages_per_site_limit >= 1),
  storage_bytes_limit BIGINT NOT NULL DEFAULT 1073741824 CHECK (storage_bytes_limit >= 0),
  custom_domain_limit INTEGER NOT NULL DEFAULT 0 CHECK (custom_domain_limit >= 0),
  monthly_ai_operation_limit INTEGER NOT NULL DEFAULT 100 CHECK (monthly_ai_operation_limit >= 0),
  monthly_build_limit INTEGER NOT NULL DEFAULT 30 CHECK (monthly_build_limit >= 0),
  monthly_traffic_bytes_limit BIGINT NOT NULL DEFAULT 10737418240 CHECK (monthly_traffic_bytes_limit >= 0),
  portal_creation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  plan_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_active_entitlement
  ON page_studio_entitlements (tenant_id, client_id)
  WHERE status IN ('trial', 'active', 'past_due', 'suspended');

CREATE TABLE IF NOT EXISTS page_studio_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  entitlement_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  route TEXT NOT NULL CHECK (route ~ '^[a-z0-9](?:[a-z0-9-]{0,62})$'),
  starter_version TEXT NOT NULL CHECK (char_length(starter_version) BETWEEN 1 AND 128),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  default_locale TEXT NOT NULL DEFAULT 'en-AU',
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  navigation JSONB NOT NULL DEFAULT '[]'::jsonb,
  footer JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_checkpoint_id TEXT,
  current_version_id UUID,
  current_release_id UUID,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, route),
  UNIQUE (tenant_id, client_id, id),
  FOREIGN KEY (tenant_id, client_id, entitlement_id)
    REFERENCES page_studio_entitlements(tenant_id, client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_sites_owner_status
  ON page_studio_sites (tenant_id, client_id, status);

CREATE TABLE IF NOT EXISTS page_studio_site_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  granted_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, user_id),
  UNIQUE (tenant_id, client_id, site_id, user_id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_studio_memberships_user
  ON page_studio_site_memberships (user_id, tenant_id, client_id);

CREATE TABLE IF NOT EXISTS page_studio_checkpoints (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  digest CHAR(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  object_key TEXT NOT NULL,
  etag TEXT NOT NULL,
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, object_key),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_studio_checkpoints_latest
  ON page_studio_checkpoints (tenant_id, client_id, site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS page_studio_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  checkpoint_id TEXT NOT NULL,
  digest CHAR(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('agency', 'client')),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'published')),
  idempotency_key TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, id, digest),
  UNIQUE (tenant_id, client_id, site_id, idempotency_key),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, checkpoint_id)
    REFERENCES page_studio_checkpoints(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_versions_created
  ON page_studio_versions (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_studio_versions_status
  ON page_studio_versions (site_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS page_studio_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  version_id UUID NOT NULL,
  version_digest CHAR(64) NOT NULL CHECK (version_digest ~ '^[a-f0-9]{64}$'),
  reviewer_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned_to_draft')),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 4000),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, version_id, id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, version_id, version_digest)
    REFERENCES page_studio_versions(tenant_id, client_id, site_id, id, digest) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_reviews_version
  ON page_studio_reviews (site_id, version_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS page_studio_builds (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  version_id UUID NOT NULL,
  version_digest CHAR(64) NOT NULL CHECK (version_digest ~ '^[a-f0-9]{64}$'),
  artifact_prefix TEXT NOT NULL,
  release_manifest_key TEXT NOT NULL,
  release_manifest_digest CHAR(64) NOT NULL CHECK (release_manifest_digest ~ '^[a-f0-9]{64}$'),
  validation_report_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'succeeded', 'failed')),
  failure_summary TEXT CHECK (failure_summary IS NULL OR char_length(failure_summary) <= 1000),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (site_id, version_digest),
  UNIQUE (tenant_id, client_id, site_id, idempotency_key),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, version_id)
    REFERENCES page_studio_versions(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS page_studio_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  build_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('preview', 'staging', 'production')),
  normalized_hostname TEXT NOT NULL CHECK (normalized_hostname = lower(normalized_hostname)),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_release_id UUID,
  idempotency_key TEXT NOT NULL,
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, idempotency_key),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, build_id)
    REFERENCES page_studio_builds(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_releases_history
  ON page_studio_releases (site_id, environment, published_at DESC);

CREATE TABLE IF NOT EXISTS page_studio_release_pointers (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('preview', 'staging', 'production')),
  normalized_hostname TEXT NOT NULL CHECK (normalized_hostname = lower(normalized_hostname)),
  active_release_id UUID NOT NULL,
  pointer_version BIGINT NOT NULL DEFAULT 1 CHECK (pointer_version >= 1),
  updated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, client_id, site_id, environment, normalized_hostname),
  UNIQUE (environment, normalized_hostname),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, active_release_id)
    REFERENCES page_studio_releases(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_release_pointers_hostname
  ON page_studio_release_pointers (normalized_hostname);

CREATE TABLE IF NOT EXISTS page_studio_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  resource_type TEXT NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 80),
  resource_id TEXT NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 128),
  request_id TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_audit_idempotency
  ON page_studio_audit_events (tenant_id, client_id, site_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_studio_audit_scope_time
  ON page_studio_audit_events (tenant_id, client_id, site_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS page_studio_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  normalized_hostname TEXT NOT NULL CHECK (normalized_hostname = lower(normalized_hostname)),
  cloudflare_hostname_id TEXT,
  ownership_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  certificate_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  hostname_status TEXT NOT NULL DEFAULT 'pending',
  tls_status TEXT NOT NULL DEFAULT 'pending',
  dns_status TEXT NOT NULL DEFAULT 'pending',
  lifecycle_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (lifecycle_state IN ('pending', 'validating', 'verified', 'active', 'failed', 'detached')),
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  detached_at TIMESTAMPTZ,
  failure_summary TEXT CHECK (failure_summary IS NULL OR char_length(failure_summary) <= 1000),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_attached_hostname
  ON page_studio_domains (normalized_hostname)
  WHERE lifecycle_state <> 'detached';
CREATE INDEX IF NOT EXISTS idx_page_studio_domains_scope
  ON page_studio_domains (tenant_id, client_id, site_id, lifecycle_state);

CREATE TABLE IF NOT EXISTS page_studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  r2_prefix TEXT NOT NULL,
  media_type TEXT NOT NULL,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  alt_text TEXT CHECK (alt_text IS NULL OR char_length(alt_text) <= 1000),
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'rejected', 'failed')),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'ready', 'published', 'archived')),
  renditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, r2_prefix),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_studio_assets_scope_status
  ON page_studio_assets (tenant_id, client_id, site_id, publication_status);

-- Current pointers are added after their immutable targets to avoid circular creation order.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_page_studio_sites_current_checkpoint'
      AND conrelid = 'page_studio_sites'::regclass
  ) THEN
    ALTER TABLE page_studio_sites
      ADD CONSTRAINT fk_page_studio_sites_current_checkpoint
      FOREIGN KEY (tenant_id, client_id, id, current_checkpoint_id)
      REFERENCES page_studio_checkpoints(tenant_id, client_id, site_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_page_studio_sites_current_version'
      AND conrelid = 'page_studio_sites'::regclass
  ) THEN
    ALTER TABLE page_studio_sites
      ADD CONSTRAINT fk_page_studio_sites_current_version
      FOREIGN KEY (tenant_id, client_id, id, current_version_id)
      REFERENCES page_studio_versions(tenant_id, client_id, site_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_page_studio_sites_current_release'
      AND conrelid = 'page_studio_sites'::regclass
  ) THEN
    ALTER TABLE page_studio_sites
      ADD CONSTRAINT fk_page_studio_sites_current_release
      FOREIGN KEY (tenant_id, client_id, id, current_release_id)
      REFERENCES page_studio_releases(tenant_id, client_id, site_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_page_studio_release_superseded'
      AND conrelid = 'page_studio_releases'::regclass
  ) THEN
    ALTER TABLE page_studio_releases
      ADD CONSTRAINT fk_page_studio_release_superseded
      FOREIGN KEY (tenant_id, client_id, site_id, superseded_release_id)
      REFERENCES page_studio_releases(tenant_id, client_id, site_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Reviews and audit events are evidence, not mutable application state.
CREATE OR REPLACE FUNCTION prevent_page_studio_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS page_studio_reviews_append_only ON page_studio_reviews;
CREATE TRIGGER page_studio_reviews_append_only
  BEFORE UPDATE OR DELETE ON page_studio_reviews
  FOR EACH ROW EXECUTE FUNCTION prevent_page_studio_immutable_mutation();

DROP TRIGGER IF EXISTS page_studio_audit_events_append_only ON page_studio_audit_events;
CREATE TRIGGER page_studio_audit_events_append_only
  BEFORE UPDATE OR DELETE ON page_studio_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_page_studio_immutable_mutation();

-- Backfill the new explicit groups because configured DB roles take precedence over static fallbacks.
INSERT INTO role_permission_groups (role_id, permission_group)
SELECT cr.id, permission_group
FROM custom_roles cr
CROSS JOIN (VALUES
  ('PAGE_STUDIO_VIEW'),
  ('PAGE_STUDIO_EDIT'),
  ('PAGE_STUDIO_APPROVE'),
  ('PAGE_STUDIO_PUBLISH'),
  ('PAGE_STUDIO_DOMAINS'),
  ('PAGE_STUDIO_SUBSCRIPTIONS')
) AS groups(permission_group)
WHERE cr.slug IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permission_groups (role_id, permission_group)
SELECT cr.id, permission_group
FROM custom_roles cr
CROSS JOIN (VALUES
  ('PAGE_STUDIO_VIEW'),
  ('PAGE_STUDIO_EDIT'),
  ('PAGE_STUDIO_APPROVE'),
  ('PAGE_STUDIO_PUBLISH')
) AS groups(permission_group)
WHERE cr.slug IN ('lead', 'project_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permission_groups (role_id, permission_group)
SELECT cr.id, permission_group
FROM custom_roles cr
CROSS JOIN (VALUES ('PAGE_STUDIO_VIEW'), ('PAGE_STUDIO_EDIT')) AS groups(permission_group)
WHERE cr.slug IN ('account_manager', 'creative', 'producer')
ON CONFLICT DO NOTHING;

COMMIT;
