-- Existing attempts retain metadata proof. Standard API creation uses the
-- authenticated creation receipt and never adopts an uncertain hostname.
BEGIN;
ALTER TABLE page_studio_domain_operations
  ADD COLUMN IF NOT EXISTS identity_mode TEXT NOT NULL DEFAULT 'metadata'
  CHECK (identity_mode IN ('metadata', 'standard'));

CREATE OR REPLACE FUNCTION page_studio_domain_identity_mode_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identity_mode IS DISTINCT FROM OLD.identity_mode THEN
    RAISE EXCEPTION 'Domain identity mode cannot change';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_domain_identity_mode_immutable ON page_studio_domain_operations;
CREATE TRIGGER page_studio_domain_identity_mode_immutable
  BEFORE UPDATE ON page_studio_domain_operations
  FOR EACH ROW EXECUTE FUNCTION page_studio_domain_identity_mode_immutable();
COMMIT;
