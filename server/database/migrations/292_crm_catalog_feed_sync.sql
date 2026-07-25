-- Additive catalog feed operations. Existing catalog rows and lead matching remain unchanged.

ALTER TABLE crm_catalog_sources
  ADD COLUMN IF NOT EXISTS feed_url TEXT,
  ADD COLUMN IF NOT EXISTS feed_format TEXT NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS item_path TEXT,
  ADD COLUMN IF NOT EXISTS field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS connection_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_item_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_catalog_sources_feed_format_check'
  ) THEN
    ALTER TABLE crm_catalog_sources
      ADD CONSTRAINT crm_catalog_sources_feed_format_check
      CHECK (feed_format IN ('json', 'csv'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_catalog_sources_last_sync_status_check'
  ) THEN
    ALTER TABLE crm_catalog_sources
      ADD CONSTRAINT crm_catalog_sources_last_sync_status_check
      CHECK (last_sync_status IS NULL OR last_sync_status IN ('running', 'succeeded', 'failed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_catalog_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  catalog_source_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  upserted_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (client_id, catalog_source_id)
    REFERENCES crm_catalog_sources(client_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_catalog_sync_runs_one_active
  ON crm_catalog_sync_runs (catalog_source_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_crm_catalog_sync_runs_source_started
  ON crm_catalog_sync_runs (client_id, catalog_source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS crm_catalog_source_credentials (
  catalog_source_id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  secret_encrypted BYTEA NOT NULL,
  secret_iv BYTEA NOT NULL,
  connected_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, catalog_source_id)
    REFERENCES crm_catalog_sources(client_id, id) ON DELETE CASCADE
);

COMMENT ON COLUMN crm_catalog_sources.feed_url IS
  'Public HTTPS feed or Supabase project URL. Credentials are stored separately with AES-GCM encryption.';
COMMENT ON TABLE crm_catalog_source_credentials IS
  'Client-scoped AES-GCM encrypted connector credentials. Secret material is never returned by CRM APIs.';
