-- Provider-free import of user-supplied audio into the canonical audio_assets pipeline.
-- kind stays the mix role ('voiceover' | 'music'); source records provenance. Imported
-- rows carry the measured, hashed original and the uploader's rights confirmation.
-- Existing generated rows default to source='generated' and are otherwise unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE audio_assets
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS source_filename TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_mime TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_sha256 TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_bytes BIGINT NULL,
  ADD COLUMN IF NOT EXISTS source_project_id UUID NULL,
  ADD COLUMN IF NOT EXISTS rights_confirmed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ NULL;

ALTER TABLE audio_assets DROP CONSTRAINT IF EXISTS audio_assets_source_check;
ALTER TABLE audio_assets ADD CONSTRAINT audio_assets_source_check
  CHECK (source IN ('generated', 'imported'));

ALTER TABLE audio_assets DROP CONSTRAINT IF EXISTS audio_assets_import_provenance_check;
ALTER TABLE audio_assets ADD CONSTRAINT audio_assets_import_provenance_check
  CHECK (
    source <> 'imported' OR (
      source_filename IS NOT NULL AND length(source_filename) BETWEEN 1 AND 255
      AND source_mime IN ('audio/wav', 'audio/mpeg', 'audio/mp4')
      AND source_sha256 ~ '^[0-9a-f]{64}$'
      AND source_bytes > 0
      AND source_project_id IS NOT NULL
      AND rights_confirmed_by IS NOT NULL
      AND rights_confirmed_at IS NOT NULL
      AND r2_key_master IS NOT NULL
      AND duration_sec > 0
    )
  );

COMMIT;
