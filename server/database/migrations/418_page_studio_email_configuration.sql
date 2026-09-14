-- Preferences are private control-plane state, not replaceable release metadata.
-- No provider verification or delivery authority is stored in this column.
ALTER TABLE page_studio_sites
  ADD COLUMN IF NOT EXISTS email_configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'page_studio_sites'::regclass
      AND conname = 'page_studio_email_configuration_environments') THEN
    ALTER TABLE page_studio_sites ADD CONSTRAINT page_studio_email_configuration_environments CHECK (
      jsonb_typeof(email_configuration) = 'object'
      AND email_configuration - 'staging' - 'production' = '{}'::jsonb
      AND (NOT email_configuration ? 'staging' OR jsonb_typeof(email_configuration->'staging') = 'object')
      AND (NOT email_configuration ? 'production' OR jsonb_typeof(email_configuration->'production') = 'object')
    );
  END IF;
END $$;
