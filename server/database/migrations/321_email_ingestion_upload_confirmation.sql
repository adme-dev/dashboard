BEGIN;

ALTER TABLE lead_email_ingestions
  ADD COLUMN IF NOT EXISTS staged_uploaded_at TIMESTAMPTZ;

-- Reservations created before the confirmation protocol already used their
-- durable object key for recovery. Preserve that compatibility on rollout.
UPDATE lead_email_ingestions
SET staged_uploaded_at = COALESCE(staged_uploaded_at, created_at)
WHERE staged_object_key IS NOT NULL
  AND staged_uploaded_at IS NULL
  AND created_at < '2026-07-29T11:20:00Z'::timestamptz;

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_recovery_uploaded
  ON lead_email_ingestions (next_attempt_at, created_at, id)
  WHERE terminal_at IS NULL
    AND staged_uploaded_at IS NOT NULL;

COMMIT;
