-- Compare-and-swap token independent of the user-visible saved version.
-- Additive and idempotent; existing rows begin at revision zero.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE media_timelines
  ADD COLUMN IF NOT EXISTS edit_revision INTEGER NOT NULL DEFAULT 0
  CHECK (edit_revision >= 0);
COMMIT;
