-- Record whether each immutable publication was rendered with XeroFlow first-party measurement.

BEGIN;

ALTER TABLE search_authority_publications
  ADD COLUMN IF NOT EXISTS measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
