ALTER TABLE page_studio_builds
  ADD COLUMN IF NOT EXISTS release_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE page_studio_builds
  DROP CONSTRAINT IF EXISTS page_studio_builds_release_metadata_object;

ALTER TABLE page_studio_builds
  ADD CONSTRAINT page_studio_builds_release_metadata_object
  CHECK (jsonb_typeof(release_metadata) = 'object');

COMMENT ON COLUMN page_studio_builds.release_metadata IS
  'Immutable manifest-derived site metadata restored atomically on activation and rollback.';

