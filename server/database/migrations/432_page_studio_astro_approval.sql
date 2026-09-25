-- Pin the review that authorized the original compiler operation. Existing Astro
-- rows without a provable approval must be reconciled explicitly, never backfilled
-- from the latest review. Apply before enabling the native Astro dispatcher.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE page_studio_builds ADD COLUMN IF NOT EXISTS astro_approval_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='page_studio_astro_approval_required' AND conrelid='page_studio_builds'::regclass) THEN
    ALTER TABLE page_studio_builds ADD CONSTRAINT page_studio_astro_approval_required CHECK (
      (renderer='astro' AND astro_approval_id IS NOT NULL) OR (renderer='legacy' AND astro_approval_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='page_studio_astro_approval_scope' AND conrelid='page_studio_builds'::regclass) THEN
    ALTER TABLE page_studio_builds ADD CONSTRAINT page_studio_astro_approval_scope
      FOREIGN KEY(tenant_id,client_id,site_id,version_id,astro_approval_id)
      REFERENCES page_studio_reviews(tenant_id,client_id,site_id,version_id,id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_page_studio_astro_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.astro_approval_id IS DISTINCT FROM OLD.astro_approval_id THEN
    RAISE EXCEPTION 'ASTRO_BUILD_APPROVAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_astro_approval_guard ON page_studio_builds;
CREATE TRIGGER page_studio_astro_approval_guard BEFORE UPDATE ON page_studio_builds
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_astro_approval();
COMMIT;
