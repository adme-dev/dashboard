-- Retain distinct native customer identity attribution without granting access.
-- Requires 442 (identities) and 452 (invited portal publisher references).
BEGIN;

ALTER TABLE page_studio_releases
  ADD COLUMN IF NOT EXISTS published_by_customer_identity_id UUID
    REFERENCES page_studio_customer_identities(id) ON DELETE SET NULL;
ALTER TABLE page_studio_release_pointers
  ADD COLUMN IF NOT EXISTS updated_by_customer_identity_id UUID
    REFERENCES page_studio_customer_identities(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_releases'::regclass
    AND conname='page_studio_release_native_publisher_exclusive') THEN
    ALTER TABLE page_studio_releases ADD CONSTRAINT page_studio_release_native_publisher_exclusive
      CHECK (num_nonnulls(published_by, published_by_client_user_id, published_by_customer_identity_id)<=1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_release_pointers'::regclass
    AND conname='page_studio_pointer_native_publisher_exclusive') THEN
    ALTER TABLE page_studio_release_pointers ADD CONSTRAINT page_studio_pointer_native_publisher_exclusive
      CHECK (num_nonnulls(updated_by, updated_by_client_user_id, updated_by_customer_identity_id)<=1);
  END IF;
END $$;

COMMIT;
