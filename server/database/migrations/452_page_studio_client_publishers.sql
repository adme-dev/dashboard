-- Preserve staff attribution while admitting explicitly authorised client publishers.
-- No grants, quotas, release pointers or customer activation state are changed.
BEGIN;

ALTER TABLE page_studio_releases
  ADD COLUMN IF NOT EXISTS published_by_client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL;
ALTER TABLE page_studio_release_pointers
  ADD COLUMN IF NOT EXISTS updated_by_client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_releases'::regclass
    AND conname='page_studio_release_single_publisher') THEN
    ALTER TABLE page_studio_releases ADD CONSTRAINT page_studio_release_single_publisher
      CHECK (published_by IS NULL OR published_by_client_user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_release_pointers'::regclass
    AND conname='page_studio_pointer_single_publisher') THEN
    ALTER TABLE page_studio_release_pointers ADD CONSTRAINT page_studio_pointer_single_publisher
      CHECK (updated_by IS NULL OR updated_by_client_user_id IS NULL);
  END IF;
END $$;

COMMIT;
