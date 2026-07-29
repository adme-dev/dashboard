-- Durable raw-content identity plus versioned privacy approval for email ingestion.
-- Legacy work without bound content evidence and existing fallback endpoints
-- without approval evidence both fail closed during the upgrade.

BEGIN;

ALTER TABLE lead_email_ingestions
  ADD COLUMN IF NOT EXISTS header_from_domain TEXT,
  ADD COLUMN IF NOT EXISTS raw_size INTEGER,
  ADD COLUMN IF NOT EXISTS raw_content_hash_version SMALLINT,
  ADD COLUMN IF NOT EXISTS raw_content_hash TEXT;

-- Rows created before content binding cannot be recovered without risking that
-- the staged MIME and canonical envelope describe different messages.
UPDATE lead_email_ingestions
SET status = 'quarantined',
    error_class = 'legacy_evidence',
    terminal_at = NOW(),
    next_attempt_at = NULL,
    recovery_lease_token = NULL,
    recovery_claimed_at = NULL,
    updated_at = NOW()
WHERE terminal_at IS NULL
  AND (
    raw_size IS NULL
    OR raw_content_hash_version IS NULL
    OR raw_content_hash IS NULL
  );

ALTER TABLE lead_email_ingestions
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_raw_size_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_raw_content_hash_version_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_raw_content_hash_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_bound_content_identity_check,
  ADD CONSTRAINT lead_email_ingestions_raw_size_check
    CHECK (raw_size IS NULL OR raw_size BETWEEN 0 AND 2097152),
  ADD CONSTRAINT lead_email_ingestions_raw_content_hash_version_check
    CHECK (raw_content_hash_version IS NULL OR raw_content_hash_version = 1),
  ADD CONSTRAINT lead_email_ingestions_raw_content_hash_check
    CHECK (raw_content_hash IS NULL OR raw_content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT lead_email_ingestions_bound_content_identity_check CHECK (
    terminal_at IS NOT NULL
    OR (
      raw_size IS NOT NULL
      AND raw_content_hash_version = 1
      AND raw_content_hash IS NOT NULL
    )
  );

ALTER TABLE lead_email_endpoints
  ADD COLUMN IF NOT EXISTS ai_privacy_approval_version SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_privacy_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_privacy_approved_by UUID
    REFERENCES team_members(id) ON DELETE RESTRICT;

UPDATE lead_email_endpoints
SET ai_extraction_mode = 'disabled',
    ai_privacy_approval_version = NULL,
    ai_privacy_approved_at = NULL,
    ai_privacy_approved_by = NULL,
    updated_at = NOW()
WHERE ai_extraction_mode = 'fallback'
  AND (
    ai_privacy_approval_version IS NULL
    OR ai_privacy_approved_at IS NULL
    OR ai_privacy_approved_by IS NULL
  );

UPDATE lead_email_endpoints
SET ai_privacy_approval_version = NULL,
    ai_privacy_approved_at = NULL,
    ai_privacy_approved_by = NULL,
    updated_at = NOW()
WHERE ai_extraction_mode <> 'fallback'
  AND (
    ai_privacy_approval_version IS NOT NULL
    OR ai_privacy_approved_at IS NOT NULL
    OR ai_privacy_approved_by IS NOT NULL
  );

ALTER TABLE lead_email_endpoints
  DROP CONSTRAINT IF EXISTS lead_email_endpoints_ai_privacy_approval_check,
  ADD CONSTRAINT lead_email_endpoints_ai_privacy_approval_check CHECK (
    (
      ai_extraction_mode = 'fallback'
      AND ai_privacy_approval_version IS NOT NULL
      AND ai_privacy_approval_version > 0
      AND ai_privacy_approved_at IS NOT NULL
      AND ai_privacy_approved_by IS NOT NULL
    )
    OR (
      ai_extraction_mode <> 'fallback'
      AND ai_privacy_approval_version IS NULL
      AND ai_privacy_approved_at IS NULL
      AND ai_privacy_approved_by IS NULL
    )
  );

COMMIT;
