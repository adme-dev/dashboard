-- Keep publication disclaimers explicit and version-bound.

BEGIN;

ALTER TABLE search_authority_content_versions
  ADD COLUMN IF NOT EXISTS disclaimer TEXT NOT NULL DEFAULT ''
    CHECK (char_length(disclaimer) <= 5000);

COMMIT;
