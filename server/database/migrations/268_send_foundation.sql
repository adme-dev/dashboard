-- 268_send_foundation.sql
-- Canonical, dormant data foundation for workspace and verified-public Send.
-- This migration creates no public routes, sends no email, and changes no R2 policy.

BEGIN;

-- Proves that an optional project belongs to the selected client.
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_client_id_id
  ON projects (client_id, id);

CREATE TABLE IF NOT EXISTS send_public_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL UNIQUE CHECK (
    email_normalized = LOWER(BTRIM(email_normalized))
    AND char_length(email_normalized) BETWEEN 3 AND 320
  ),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'expired', 'suspended', 'blocked')),
  verification_token_hash TEXT UNIQUE,
  verification_expires_at TIMESTAMPTZ,
  verification_consumed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0),
  abuse_status TEXT NOT NULL DEFAULT 'clear'
    CHECK (abuse_status IN ('clear', 'review', 'limited', 'blocked')),
  limit_state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limit_state) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verification_token_hash IS NULL OR verification_token_hash ~ '^[a-f0-9]{64}$'),
  CHECK ((verification_token_hash IS NULL) = (verification_expires_at IS NULL)),
  CHECK (verification_consumed_at IS NULL OR verification_token_hash IS NOT NULL),
  CHECK (verified_at IS NULL OR verification_status IN ('verified', 'suspended', 'blocked'))
);

CREATE TABLE IF NOT EXISTS send_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT CHECK (tenant_id IS NULL OR char_length(tenant_id) BETWEEN 1 AND 255),
  client_id UUID REFERENCES agency_clients(id) ON DELETE RESTRICT,
  project_id UUID,
  sender_class TEXT NOT NULL CHECK (sender_class IN ('workspace', 'public')),
  owner_team_member_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  public_sender_id UUID REFERENCES send_public_senders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'awaiting_verification',
    'uploading',
    'scanning',
    'ready',
    'revoked',
    'expired',
    'deletion_pending',
    'deleted',
    'failed'
  )),
  title TEXT NOT NULL CHECK (char_length(BTRIM(title)) BETWEEN 1 AND 255),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 5000),
  share_token_hash TEXT UNIQUE,
  management_token_hash TEXT UNIQUE,
  access_mode TEXT NOT NULL DEFAULT 'link' CHECK (access_mode IN ('link', 'password')),
  password_hash TEXT,
  max_downloads INTEGER CHECK (max_downloads IS NULL OR max_downloads > 0),
  download_count BIGINT NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  configured_max_bytes BIGINT NOT NULL CHECK (configured_max_bytes > 0),
  configured_max_files INTEGER NOT NULL CHECK (configured_max_files > 0),
  expected_total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (expected_total_bytes >= 0),
  actual_total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (actual_total_bytes >= 0),
  expected_file_count INTEGER NOT NULL DEFAULT 0 CHECK (expected_file_count >= 0),
  actual_file_count INTEGER NOT NULL DEFAULT 0 CHECK (actual_file_count >= 0),
  policy_snapshot JSONB NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  creation_idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(creation_idempotency_key) BETWEEN 16 AND 255),
  expires_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  deletion_claimed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  failure_code TEXT CHECK (failure_code IS NULL OR char_length(failure_code) BETWEEN 1 AND 100),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id)
    REFERENCES projects(client_id, id) ON DELETE RESTRICT,
  CHECK (
    (sender_class = 'workspace'
      AND owner_team_member_id IS NOT NULL
      AND public_sender_id IS NULL)
    OR
    (sender_class = 'public'
      AND owner_team_member_id IS NULL
      AND public_sender_id IS NOT NULL
      AND tenant_id IS NULL
      AND client_id IS NULL
      AND project_id IS NULL)
  ),
  CHECK ((sender_class = 'public') = (management_token_hash IS NOT NULL)),
  CHECK (share_token_hash IS NULL OR share_token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (management_token_hash IS NULL OR management_token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (password_hash IS NULL OR LEFT(password_hash, 4) IN ('$2a$', '$2b$', '$2y$')),
  CHECK (
    (access_mode = 'link' AND password_hash IS NULL)
    OR (access_mode = 'password' AND password_hash IS NOT NULL)
  ),
  CHECK (download_count <= COALESCE(max_downloads::BIGINT, download_count)),
  CHECK (expected_total_bytes <= configured_max_bytes),
  CHECK (actual_total_bytes <= configured_max_bytes),
  CHECK (expected_file_count <= configured_max_files),
  CHECK (actual_file_count <= configured_max_files),
  CHECK (project_id IS NULL OR client_id IS NOT NULL),
  CHECK (status <> 'ready' OR share_token_hash IS NOT NULL),
  CHECK (expires_at > created_at),
  CHECK (published_at IS NULL OR published_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (deleted_at IS NULL OR deletion_claimed_at IS NOT NULL),
  CHECK ((status = 'ready') = (published_at IS NOT NULL) OR status IN ('revoked', 'expired', 'deletion_pending', 'deleted')),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL) OR status IN ('deletion_pending', 'deleted'))
);

CREATE TABLE IF NOT EXISTS send_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES send_transfers(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE CHECK (
    octet_length(object_key) BETWEEN 1 AND 1024
    AND object_key LIKE ('send/' || transfer_id::TEXT || '/%')
  ),
  original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  display_filename TEXT NOT NULL CHECK (char_length(display_filename) BETWEEN 1 AND 255),
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
  actual_size_bytes BIGINT CHECK (actual_size_bytes IS NULL OR actual_size_bytes > 0),
  declared_mime_type TEXT NOT NULL CHECK (char_length(declared_mime_type) BETWEEN 1 AND 255),
  actual_mime_type TEXT CHECK (actual_mime_type IS NULL OR char_length(actual_mime_type) BETWEEN 1 AND 255),
  checksum_algorithm TEXT CHECK (checksum_algorithm IS NULL OR checksum_algorithm IN ('md5', 'sha256')),
  checksum_value TEXT CHECK (checksum_value IS NULL OR char_length(checksum_value) BETWEEN 16 AND 128),
  object_etag TEXT CHECK (object_etag IS NULL OR char_length(object_etag) BETWEEN 1 AND 255),
  upload_method TEXT NOT NULL CHECK (upload_method IN ('single', 'multipart')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
    'pending',
    'uploading',
    'uploaded',
    'quarantined',
    'clean',
    'aborted',
    'rejected',
    'failed',
    'deleted'
  )),
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'running', 'clean', 'infected', 'error', 'not_required')),
  scan_provider TEXT CHECK (scan_provider IS NULL OR char_length(scan_provider) BETWEEN 1 AND 100),
  scan_version TEXT CHECK (scan_version IS NULL OR char_length(scan_version) BETWEEN 1 AND 100),
  scan_evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scan_evidence) = 'object'),
  upload_started_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transfer_id, id),
  UNIQUE (transfer_id, id, object_key, expected_size_bytes, declared_mime_type, upload_method),
  CHECK ((checksum_algorithm IS NULL) = (checksum_value IS NULL)),
  CHECK (actual_size_bytes IS NULL OR actual_size_bytes <= expected_size_bytes),
  CHECK (uploaded_at IS NULL OR upload_started_at IS NOT NULL),
  CHECK (scanned_at IS NULL OR uploaded_at IS NOT NULL),
  CHECK (deleted_at IS NULL OR state = 'deleted')
);

CREATE TABLE IF NOT EXISTS send_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES send_transfers(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL CHECK (
    email_normalized = LOWER(BTRIM(email_normalized))
    AND char_length(email_normalized) BETWEEN 3 AND 320
  ),
  delivery_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error_code TEXT CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transfer_id, email_normalized)
);

CREATE TABLE IF NOT EXISTS send_upload_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL,
  file_id UUID NOT NULL,
  uploader_class TEXT NOT NULL
    CHECK (uploader_class IN ('workspace', 'verified_public', 'system')),
  uploader_id TEXT NOT NULL CHECK (char_length(uploader_id) BETWEEN 1 AND 255),
  object_key TEXT NOT NULL CHECK (octet_length(object_key) BETWEEN 1 AND 1024),
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
  expected_mime_type TEXT NOT NULL CHECK (char_length(expected_mime_type) BETWEEN 1 AND 255),
  upload_method TEXT NOT NULL CHECK (upload_method IN ('single', 'multipart')),
  multipart_upload_id TEXT CHECK (
    multipart_upload_id IS NULL OR char_length(multipart_upload_id) BETWEEN 1 AND 1024
  ),
  capability_nonce_hash TEXT NOT NULL UNIQUE
    CHECK (capability_nonce_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'completed', 'aborted', 'expired')),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 255),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, idempotency_key),
  FOREIGN KEY (
    transfer_id,
    file_id,
    object_key,
    expected_size_bytes,
    expected_mime_type,
    upload_method
  ) REFERENCES send_files(
    transfer_id,
    id,
    object_key,
    expected_size_bytes,
    declared_mime_type,
    upload_method
  ) ON DELETE CASCADE,
  CHECK ((upload_method = 'multipart') OR multipart_upload_id IS NULL),
  CHECK (expires_at > created_at),
  CHECK (completed_at IS NULL OR completed_at <= expires_at),
  CHECK (completed_at IS NULL OR aborted_at IS NULL),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((status = 'aborted') = (aborted_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS send_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES send_transfers(id) ON DELETE CASCADE,
  file_id UUID,
  actor_class TEXT NOT NULL
    CHECK (actor_class IN ('workspace_user', 'public_sender', 'recipient', 'system', 'operator')),
  actor_id TEXT CHECK (actor_id IS NULL OR char_length(actor_id) BETWEEN 1 AND 255),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'draft_created',
    'sender_verified',
    'upload_intent_created',
    'upload_completed',
    'scan_completed',
    'published',
    'notification_queued',
    'notification_sent',
    'unlocked',
    'viewed',
    'downloaded',
    'revoked',
    'expired',
    'deletion_claimed',
    'deleted',
    'reported',
    'operator_action',
    'failed'
  )),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 255),
  request_correlation_id TEXT CHECK (
    request_correlation_id IS NULL OR char_length(request_correlation_id) BETWEEN 1 AND 255
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object'
    AND NOT (metadata ?| ARRAY['password', 'shareToken', 'managementToken', 'signedUrl', 'ipAddress'])
    AND metadata::TEXT !~* '"(password|share_?token|management_?token|signed_?url|ip_?address)"[[:space:]]*:'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transfer_id, idempotency_key),
  FOREIGN KEY (transfer_id, file_id)
    REFERENCES send_files(transfer_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_send_public_senders_verification
  ON send_public_senders (verification_status, verification_expires_at)
  WHERE verification_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_send_transfers_workspace_owner
  ON send_transfers (owner_team_member_id, status, created_at DESC)
  WHERE sender_class = 'workspace';
CREATE INDEX IF NOT EXISTS idx_send_transfers_client
  ON send_transfers (client_id, status, created_at DESC)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_transfers_public_sender
  ON send_transfers (public_sender_id, status, created_at DESC)
  WHERE public_sender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_transfers_expiry_cleanup
  ON send_transfers (expires_at, status)
  WHERE status NOT IN ('deleted', 'deletion_pending');
CREATE INDEX IF NOT EXISTS idx_send_files_transfer_state
  ON send_files (transfer_id, state, created_at);
CREATE INDEX IF NOT EXISTS idx_send_files_scan_queue
  ON send_files (scan_status, uploaded_at)
  WHERE state IN ('uploaded', 'quarantined');
CREATE INDEX IF NOT EXISTS idx_send_recipients_delivery
  ON send_recipients (delivery_state, created_at)
  WHERE delivery_state IN ('pending', 'queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_send_upload_intents_expiry
  ON send_upload_intents (expires_at, status)
  WHERE status IN ('pending', 'uploading');
CREATE INDEX IF NOT EXISTS idx_send_events_transfer_time
  ON send_events (transfer_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION set_send_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_send_transfer_identity_and_policy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.sender_class IS DISTINCT FROM OLD.sender_class
    OR NEW.owner_team_member_id IS DISTINCT FROM OLD.owner_team_member_id
    OR NEW.public_sender_id IS DISTINCT FROM OLD.public_sender_id
    OR (OLD.share_token_hash IS NOT NULL
      AND NEW.share_token_hash IS DISTINCT FROM OLD.share_token_hash)
    OR (OLD.share_token_hash IS NULL
      AND NEW.share_token_hash IS NOT NULL
      AND NOT (OLD.status = 'scanning' AND NEW.status = 'ready'))
    OR NEW.creation_idempotency_key IS DISTINCT FROM OLD.creation_idempotency_key THEN
    RAISE EXCEPTION 'Send transfer identity is immutable';
  END IF;

  IF OLD.published_at IS NOT NULL
    AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
    RAISE EXCEPTION 'Published Send policy snapshots are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_send_public_senders_updated_at ON send_public_senders;
CREATE TRIGGER trg_send_public_senders_updated_at
BEFORE UPDATE ON send_public_senders
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

DROP TRIGGER IF EXISTS trg_send_transfers_updated_at ON send_transfers;
CREATE TRIGGER trg_send_transfers_updated_at
BEFORE UPDATE ON send_transfers
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

DROP TRIGGER IF EXISTS trg_send_transfers_immutable ON send_transfers;
CREATE TRIGGER trg_send_transfers_immutable
BEFORE UPDATE ON send_transfers
FOR EACH ROW EXECUTE FUNCTION protect_send_transfer_identity_and_policy();

DROP TRIGGER IF EXISTS trg_send_files_updated_at ON send_files;
CREATE TRIGGER trg_send_files_updated_at
BEFORE UPDATE ON send_files
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

DROP TRIGGER IF EXISTS trg_send_recipients_updated_at ON send_recipients;
CREATE TRIGGER trg_send_recipients_updated_at
BEFORE UPDATE ON send_recipients
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

DROP TRIGGER IF EXISTS trg_send_upload_intents_updated_at ON send_upload_intents;
CREATE TRIGGER trg_send_upload_intents_updated_at
BEFORE UPDATE ON send_upload_intents
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

CREATE OR REPLACE FUNCTION prevent_send_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'send_events is append-only; insert a correcting event instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_send_events_append_only ON send_events;
CREATE TRIGGER trg_send_events_append_only
BEFORE UPDATE OR DELETE ON send_events
FOR EACH ROW EXECUTE FUNCTION prevent_send_event_mutation();

COMMENT ON COLUMN send_transfers.tenant_id IS
  'Optional opaque application tenant scope. Never infer it from an Xero connection or public request.';
COMMENT ON COLUMN send_transfers.policy_snapshot IS
  'Immutable-at-publication policy evidence. Application transitions must reject changes after publication.';
COMMENT ON COLUMN send_upload_intents.multipart_upload_id IS
  'Server-only R2 multipart coordination identifier; never expose it through guest metadata or logs.';
COMMENT ON COLUMN send_events.metadata IS
  'Redacted operational metadata only. Never store raw tokens, passwords, signed URLs, or full IP addresses.';

COMMIT;
