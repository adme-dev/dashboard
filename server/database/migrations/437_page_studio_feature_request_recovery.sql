-- Durable discovery across editor sessions. No prompts, tokens or generated
-- content are stored here. Dismissed IDs remain reserved against late replays.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS page_studio_feature_requests (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('agency', 'client')),
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK (request_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  checkpoint_id TEXT NOT NULL CHECK (checkpoint_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  checkpoint_digest TEXT NOT NULL CHECK (checkpoint_digest ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, client_id, site_id, environment, actor_role, actor_id, request_id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS page_studio_feature_requests_pending
  ON page_studio_feature_requests(tenant_id, client_id, site_id, environment, actor_role, actor_id)
  WHERE state = 'pending';
COMMIT;
