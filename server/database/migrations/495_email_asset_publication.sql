-- Parent applies this migration. Existing banner_assets remains the library.
-- Descriptors certify scoped registered bytes, not private staging or send readiness.
ALTER TABLE banner_assets ADD COLUMN IF NOT EXISTS email_publication jsonb;
CREATE TABLE IF NOT EXISTS email_asset_publication_receipts (
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES banner_assets(id) ON DELETE RESTRICT,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  descriptor jsonb NOT NULL CHECK (jsonb_typeof(descriptor)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,operation_id)
);
CREATE OR REPLACE FUNCTION email_protect_published_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.email_publication IS NOT NULL THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Published email assets are immutable' USING ERRCODE='55000';
    END IF;
    IF ROW(NEW.id,NEW.client_id,NEW.uploaded_by,NEW.r2_key,NEW.url,NEW.mime_type,NEW.file_size,NEW.email_publication)
      IS DISTINCT FROM ROW(OLD.id,OLD.client_id,OLD.uploaded_by,OLD.r2_key,OLD.url,OLD.mime_type,OLD.file_size,OLD.email_publication) THEN
      RAISE EXCEPTION 'Published email assets are immutable' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_asset_publication_identity ON banner_assets;
CREATE TRIGGER email_asset_publication_identity BEFORE UPDATE OR DELETE ON banner_assets
  FOR EACH ROW EXECUTE FUNCTION email_protect_published_asset();
DROP TRIGGER IF EXISTS email_asset_publication_receipt_immutable ON email_asset_publication_receipts;
CREATE TRIGGER email_asset_publication_receipt_immutable BEFORE UPDATE OR DELETE ON email_asset_publication_receipts
  FOR EACH ROW EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_asset_publication_receipt_no_truncate ON email_asset_publication_receipts;
CREATE TRIGGER email_asset_publication_receipt_no_truncate BEFORE TRUNCATE ON email_asset_publication_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION email_design_reject_revision_mutation();

-- Versioned module content is a projection of its canonical head. Preserve all
-- legacy schema-0 mutable rows, and do not invent another revision identity.
CREATE OR REPLACE FUNCTION email_protect_module_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source jsonb; version integer;
BEGIN
  SELECT r.payload,r.schema_version INTO source,version FROM email_design_documents d
    JOIN email_design_revisions r ON r.id=d.head_revision_id WHERE d.module_id=OLD.id;
  IF FOUND AND version=1 AND NEW.blocks IS DISTINCT FROM
    jsonb_build_object('blocks',source->'blocks','rootChildrenIds',source->'rootChildrenIds') THEN
    RAISE EXCEPTION 'Module content must match its immutable revision' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_module_projection ON edm_custom_modules;
CREATE TRIGGER email_module_projection BEFORE UPDATE OF blocks ON edm_custom_modules
  FOR EACH ROW EXECUTE FUNCTION email_protect_module_projection();
