-- Additive foundation only. Existing CRUD/send paths are not switched here.
-- Legacy IDs and frozen campaign HTML remain untouched. Backfill is separate.
CREATE TABLE IF NOT EXISTS email_design_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid UNIQUE REFERENCES edm_templates(id) ON DELETE RESTRICT,
  module_id uuid UNIQUE REFERENCES edm_custom_modules(id) ON DELETE RESTRICT,
  campaign_id uuid UNIQUE REFERENCES campaigns(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES agency_clients(id) ON DELETE RESTRICT,
  head_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(template_id, module_id, campaign_id) = 1),
  CHECK (campaign_id IS NULL OR client_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS email_design_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES email_design_documents(id) ON DELETE RESTRICT,
  parent_revision_id uuid,
  schema_version integer NOT NULL CHECK (schema_version IN (0, 1)),
  origin text NOT NULL DEFAULT 'design' CHECK ((origin = 'design' AND schema_version = 1) OR (origin = 'legacy' AND schema_version = 0)),
  payload_text text NOT NULL CHECK (schema_version = 0 OR octet_length(payload_text) <= 2097152),
  payload jsonb GENERATED ALWAYS AS (payload_text::jsonb) STORED CHECK (jsonb_typeof(payload) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, id),
  FOREIGN KEY (document_id, parent_revision_id) REFERENCES email_design_revisions(document_id, id) ON DELETE RESTRICT
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'email_design_documents'::regclass AND conname = 'email_design_head_revision_fk') THEN
    ALTER TABLE email_design_documents ADD CONSTRAINT email_design_head_revision_fk
      FOREIGN KEY (id, head_revision_id) REFERENCES email_design_revisions(document_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS email_design_single_root ON email_design_revisions(document_id) WHERE parent_revision_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_design_single_successor ON email_design_revisions(document_id, parent_revision_id) WHERE parent_revision_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS email_design_revision_receipts (
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  document_id uuid NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  revision_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id),
  FOREIGN KEY (document_id, revision_id) REFERENCES email_design_revisions(document_id, id) ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION email_design_reject_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Email design history is immutable' USING ERRCODE = '55000';
END $$;
CREATE OR REPLACE FUNCTION email_design_protect_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate_parent uuid;
BEGIN
  IF ROW(NEW.id, NEW.template_id, NEW.module_id, NEW.campaign_id, NEW.client_id)
    IS DISTINCT FROM ROW(OLD.id, OLD.template_id, OLD.module_id, OLD.campaign_id, OLD.client_id) THEN
    RAISE EXCEPTION 'Email design identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.head_revision_id IS DISTINCT FROM OLD.head_revision_id THEN
    SELECT parent_revision_id INTO candidate_parent FROM email_design_revisions
      WHERE id = NEW.head_revision_id AND document_id = OLD.id;
    IF NOT FOUND OR candidate_parent IS DISTINCT FROM OLD.head_revision_id THEN
      RAISE EXCEPTION 'Email design head must advance to its successor' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_revision_immutable ON email_design_revisions;
CREATE TRIGGER email_design_revision_immutable BEFORE UPDATE OR DELETE ON email_design_revisions
  FOR EACH ROW EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_design_revision_no_truncate ON email_design_revisions;
CREATE TRIGGER email_design_revision_no_truncate BEFORE TRUNCATE ON email_design_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_design_receipt_immutable ON email_design_revision_receipts;
CREATE TRIGGER email_design_receipt_immutable BEFORE UPDATE OR DELETE ON email_design_revision_receipts
  FOR EACH ROW EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_design_receipt_no_truncate ON email_design_revision_receipts;
CREATE TRIGGER email_design_receipt_no_truncate BEFORE TRUNCATE ON email_design_revision_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_design_document_identity ON email_design_documents;
CREATE TRIGGER email_design_document_identity BEFORE UPDATE ON email_design_documents
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_identity();

CREATE OR REPLACE FUNCTION email_design_check_revision_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_head uuid;
BEGIN
  SELECT head_revision_id INTO current_head FROM email_design_documents WHERE id = NEW.document_id FOR UPDATE;
  IF NOT FOUND OR NEW.parent_revision_id IS DISTINCT FROM current_head THEN
    RAISE EXCEPTION 'Email design parent must be the current head' USING ERRCODE = '55000';
  END IF;
  IF current_head IS NULL AND NEW.origin <> 'legacy' THEN
    RAISE EXCEPTION 'Legacy baseline required before design revision' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION email_design_check_committed_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM email_design_documents WHERE id=NEW.document_id AND head_revision_id=NEW.id)
     AND NOT EXISTS (SELECT 1 FROM email_design_revisions WHERE document_id=NEW.document_id AND parent_revision_id=NEW.id) THEN
    RAISE EXCEPTION 'A revision must be reachable from the committed head' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_design_revision_parent ON email_design_revisions;
CREATE TRIGGER email_design_revision_parent BEFORE INSERT ON email_design_revisions
  FOR EACH ROW EXECUTE FUNCTION email_design_check_revision_parent();
DROP TRIGGER IF EXISTS email_design_committed_head ON email_design_revisions;
CREATE CONSTRAINT TRIGGER email_design_committed_head AFTER INSERT ON email_design_revisions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION email_design_check_committed_head();

-- Ownership changes require an explicit copy workflow; historical scoped data
-- must not silently acquire a different audience through legacy mutable rows.
CREATE OR REPLACE FUNCTION email_design_protect_owner_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_versioned boolean;
BEGIN
  IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'edm_templates' THEN
    SELECT EXISTS(SELECT 1 FROM email_design_documents WHERE template_id=OLD.id) INTO is_versioned;
  ELSIF TG_TABLE_NAME = 'edm_custom_modules' THEN
    SELECT EXISTS(SELECT 1 FROM email_design_documents WHERE module_id=OLD.id) INTO is_versioned;
  ELSE
    SELECT EXISTS(SELECT 1 FROM email_design_documents WHERE campaign_id=OLD.id) INTO is_versioned;
  END IF;
  IF is_versioned THEN
    RAISE EXCEPTION 'Copy a versioned email design to change its scope'
      USING ERRCODE = '55000', CONSTRAINT = 'email_design_scope_copy_required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_owner_scope ON edm_templates;
CREATE TRIGGER email_design_owner_scope BEFORE UPDATE OF client_id ON edm_templates
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_owner_scope();
DROP TRIGGER IF EXISTS email_design_owner_scope ON edm_custom_modules;
CREATE TRIGGER email_design_owner_scope BEFORE UPDATE OF client_id ON edm_custom_modules
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_owner_scope();
DROP TRIGGER IF EXISTS email_design_owner_scope ON campaigns;
CREATE TRIGGER email_design_owner_scope BEFORE UPDATE OF client_id ON campaigns
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_owner_scope();

ALTER TABLE edm_templates ADD COLUMN IF NOT EXISTS email_design_revision_id uuid REFERENCES email_design_revisions(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION email_design_protect_template_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head_id uuid; source jsonb; version integer;
BEGIN
  SELECT r.id,r.payload,r.schema_version INTO head_id,source,version
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id
    WHERE d.template_id=OLD.id;
  IF NOT FOUND OR version<>1 THEN RETURN NEW; END IF;
  IF ROW(NEW.body_source,NEW.body_html,NEW.subject,NEW.preview_text,NEW.template_kind,NEW.email_design_revision_id)
    IS DISTINCT FROM ROW(OLD.body_source,OLD.body_html,OLD.subject,OLD.preview_text,OLD.template_kind,OLD.email_design_revision_id) THEN
    IF NEW.email_design_revision_id IS NOT DISTINCT FROM OLD.email_design_revision_id
      OR NEW.email_design_revision_id IS DISTINCT FROM head_id
      OR NEW.body_source IS DISTINCT FROM source->'blocks'
      OR NEW.template_kind IS DISTINCT FROM 'draft'
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.preview_text IS DISTINCT FROM OLD.preview_text THEN
      RAISE EXCEPTION 'Reload the versioned email draft before editing'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_template_projection ON edm_templates;
CREATE TRIGGER email_design_template_projection BEFORE UPDATE ON edm_templates
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_template_projection();
