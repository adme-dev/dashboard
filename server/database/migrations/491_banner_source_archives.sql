-- Private retention of original TheBrief HTML5 export ZIPs, one row per size (child) ZIP.
-- Held designs are retained too, so conversion can be retried without re-exporting.
-- Objects live in the private R2 prefix thebrief-sources/; no public URL is ever stored.
-- Identity is (client, design, SHA-256): identical bytes under another client or design
-- are a separate archive. The row is reserved (stored_at NULL) before any R2 write and
-- completed afterwards, so every object has a row and a failed upload is retryable.
BEGIN;
CREATE TABLE IF NOT EXISTS banner_source_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE RESTRICT,
  source_design_hash TEXT NOT NULL CHECK (source_design_hash ~ '^[0-9a-z]{4,32}$'),
  source_child_hash TEXT CHECK (source_child_hash IS NULL OR source_child_hash ~ '^[0-9a-z]{4,32}$'),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes BIGINT NOT NULL CHECK (bytes > 0),
  original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  source_folder_path TEXT CHECK (source_folder_path IS NULL OR length(source_folder_path) <= 500),
  size_label TEXT CHECK (size_label IS NULL OR size_label ~ '^[0-9]{1,5}x[0-9]{1,5}$'),
  source_batch_sha256 TEXT CHECK (source_batch_sha256 IS NULL OR source_batch_sha256 ~ '^[0-9a-f]{64}$'),
  r2_key TEXT NOT NULL UNIQUE CHECK (r2_key LIKE 'thebrief-sources/%'),
  project_id UUID REFERENCES banner_projects(id) ON DELETE SET NULL,
  conversion_status TEXT NOT NULL DEFAULT 'pending' CHECK (conversion_status IN ('imported', 'held', 'pending')),
  hold_reason TEXT CHECK (hold_reason IS NULL OR length(hold_reason) <= 2000),
  uploaded_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stored_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Unassigned (NULL client) archives share one identity namespace.
CREATE UNIQUE INDEX IF NOT EXISTS banner_source_archives_identity_idx
  ON banner_source_archives ((COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)), source_design_hash, sha256);
CREATE INDEX IF NOT EXISTS banner_source_archives_client_design_idx
  ON banner_source_archives (client_id, source_design_hash);
CREATE INDEX IF NOT EXISTS banner_source_archives_design_idx
  ON banner_source_archives (source_design_hash);
CREATE INDEX IF NOT EXISTS banner_source_archives_sha_idx
  ON banner_source_archives (sha256);
CREATE INDEX IF NOT EXISTS banner_source_archives_reserved_idx
  ON banner_source_archives (created_at) WHERE stored_at IS NULL;
CREATE INDEX IF NOT EXISTS banner_source_archives_project_idx
  ON banner_source_archives (project_id) WHERE project_id IS NOT NULL;
COMMIT;
