-- Same-owner published-template successors only. No backfill/activation and no
-- changes to 491–498. 498's rendered_html_sha256 remains campaign-only.
ALTER TABLE email_design_revisions ADD COLUMN IF NOT EXISTS template_rendered_html_sha256 text
  CHECK (template_rendered_html_sha256 IS NULL OR template_rendered_html_sha256 ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION email_design_check_template_publication_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_client uuid; owner_kind text;
BEGIN
  IF NEW.template_rendered_html_sha256 IS NULL THEN RETURN NEW; END IF;
  SELECT t.client_id,t.template_kind INTO owner_client,owner_kind
    FROM email_design_documents d JOIN edm_templates t ON t.id=d.template_id
    WHERE d.id=NEW.document_id;
  IF NOT FOUND OR owner_kind IS DISTINCT FROM 'template' OR NEW.schema_version<>1
    OR NEW.payload_text::jsonb->>'kind' IS DISTINCT FROM 'template'
    OR NEW.payload_text::jsonb->'scope'->>'clientId' IS DISTINCT FROM owner_client::text THEN
    RAISE EXCEPTION 'Published template metadata requires its in-scope published owner'
      USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_template_publication_revision ON email_design_revisions;
CREATE TRIGGER email_design_template_publication_revision BEFORE INSERT ON email_design_revisions
  FOR EACH ROW EXECUTE FUNCTION email_design_check_template_publication_revision();

CREATE OR REPLACE FUNCTION email_design_protect_template_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head_id uuid; source jsonb; version integer; head_subject text; head_preview text;
  parent_id uuid; html_hash text; owner_client uuid; parent_source jsonb; parent_subject text; parent_preview text; parent_version integer;
BEGIN
  SELECT r.id,r.payload,r.schema_version,r.subject,r.preview_text,r.parent_revision_id,r.template_rendered_html_sha256,d.client_id
    INTO head_id,source,version,head_subject,head_preview,parent_id,html_hash,owner_client
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id AND r.document_id=d.id
    WHERE d.template_id=OLD.id;
  -- A mutable head must not erase a published owner's structured history.
  -- OLD identity plus immutable revisions survive compound downgrade/demotion.
  IF OLD.template_kind='template' AND EXISTS (
    SELECT 1 FROM email_design_documents d JOIN email_design_revisions r ON r.document_id=d.id
    WHERE d.template_id=OLD.id AND r.schema_version=1
  ) THEN
    IF version IS DISTINCT FROM 1 OR NEW.template_kind IS DISTINCT FROM OLD.template_kind OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Published template identity and kind are immutable'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
    IF ROW(NEW.body_source,NEW.body_html,NEW.subject,NEW.preview_text,NEW.email_design_revision_id)
      IS NOT DISTINCT FROM ROW(OLD.body_source,OLD.body_html,OLD.subject,OLD.preview_text,OLD.email_design_revision_id) THEN RETURN NEW; END IF;
    SELECT r.payload,r.subject,r.preview_text,r.schema_version INTO parent_source,parent_subject,parent_preview,parent_version
      FROM email_design_revisions r WHERE r.id=parent_id AND r.document_id=(SELECT id FROM email_design_documents WHERE template_id=OLD.id);
    IF NEW.email_design_revision_id IS NOT DISTINCT FROM OLD.email_design_revision_id
      OR NEW.email_design_revision_id IS DISTINCT FROM head_id
      OR parent_version IS DISTINCT FROM 1
      OR (OLD.email_design_revision_id IS NOT NULL AND parent_id IS DISTINCT FROM OLD.email_design_revision_id)
      OR parent_source->'blocks' IS DISTINCT FROM OLD.body_source
      OR parent_subject IS DISTINCT FROM OLD.subject OR parent_preview IS DISTINCT FROM OLD.preview_text
      OR source->>'kind' IS DISTINCT FROM 'template'
      OR source->'scope'->>'clientId' IS DISTINCT FROM owner_client::text
      OR NEW.body_source IS DISTINCT FROM source->'blocks'
      OR NEW.subject IS DISTINCT FROM head_subject OR NEW.preview_text IS DISTINCT FROM head_preview
      OR html_hash IS NULL OR NEW.body_html IS NULL
      OR html_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.body_html,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'Publish an exact template successor before changing the library projection'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
    RETURN NEW;
  END IF;
  IF version IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
  -- Preserve the 492 draft/schema-0 projection behavior verbatim.
  IF ROW(NEW.body_source,NEW.body_html,NEW.subject,NEW.preview_text,NEW.template_kind,NEW.email_design_revision_id)
    IS DISTINCT FROM ROW(OLD.body_source,OLD.body_html,OLD.subject,OLD.preview_text,OLD.template_kind,OLD.email_design_revision_id) THEN
    IF NEW.email_design_revision_id IS NOT DISTINCT FROM OLD.email_design_revision_id
      OR NEW.email_design_revision_id IS DISTINCT FROM head_id
      OR NEW.body_source IS DISTINCT FROM source->'blocks'
      OR NEW.template_kind IS DISTINCT FROM 'draft'
      OR NEW.subject IS DISTINCT FROM head_subject OR NEW.preview_text IS DISTINCT FROM head_preview THEN
      RAISE EXCEPTION 'Reload the versioned email draft before editing'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Head and projection must commit together, including failed multi-statement
-- writes. Existing first publications retain their unchanged NULL-pointer R1:
-- that bootstrap must exactly match the immutable schema-0 creation snapshot.
CREATE OR REPLACE FUNCTION email_design_check_template_publication_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template uuid; projected edm_templates%ROWTYPE; head_id uuid; source jsonb; version integer;
  head_subject text; head_preview text; html_hash text; parent_version integer; parent_source jsonb;
BEGIN
  IF TG_TABLE_NAME='email_design_documents' THEN template:=NEW.template_id; ELSE template:=NEW.id; END IF;
  IF template IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO projected FROM edm_templates WHERE id=template;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Deferred checks retain the prior owner identity instead of trusting only
  -- final kind. Ordinary draft histories do not imply publication.
  IF TG_TABLE_NAME='edm_templates' THEN
    IF OLD.template_kind='template' AND projected.template_kind IS DISTINCT FROM 'template'
      AND EXISTS (SELECT 1 FROM email_design_documents d JOIN email_design_revisions r ON r.document_id=d.id
        WHERE d.template_id=template AND r.schema_version=1) THEN
      RAISE EXCEPTION 'Published template identity and kind are immutable'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
  END IF;
  IF projected.template_kind IS DISTINCT FROM 'template' THEN RETURN NULL; END IF;
  SELECT r.id,r.payload,r.schema_version,r.subject,r.preview_text,r.template_rendered_html_sha256,p.schema_version,p.payload
    INTO head_id,source,version,head_subject,head_preview,html_hash,parent_version,parent_source
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id AND r.document_id=d.id
    LEFT JOIN email_design_revisions p ON p.id=r.parent_revision_id AND p.document_id=d.id WHERE d.template_id=template;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM email_design_documents d JOIN email_design_revisions r ON r.document_id=d.id
      WHERE d.template_id=template AND r.schema_version=1) THEN
      RAISE EXCEPTION 'Published template head and projection must commit together'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
    RETURN NULL;
  END IF;
  IF version=0 AND parent_version IS NULL AND projected.email_design_revision_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id
      WHERE d.template_id=template AND r.schema_version=1) THEN RETURN NULL; END IF;
  -- Only the fresh publication helper's original legacy root -> first design
  -- pair may use the NULL-pointer bootstrap. Immutable prior history cannot
  -- become an initial publication again by advancing through a legacy child.
  IF version=1 AND projected.email_design_revision_id IS NULL AND html_hash IS NULL AND parent_version=0
    AND EXISTS (
      SELECT 1 FROM email_design_revisions initial
      JOIN email_design_revisions baseline ON baseline.document_id=initial.document_id AND baseline.id=initial.parent_revision_id
      WHERE initial.id=head_id AND initial.schema_version=1
        AND baseline.schema_version=0 AND baseline.origin='legacy' AND baseline.parent_revision_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM email_design_revisions other
          WHERE other.document_id=initial.document_id AND other.id<>baseline.id AND other.id<>initial.id)
    )
    AND source->>'kind'='template' AND source->'scope'->>'clientId' IS NOT DISTINCT FROM projected.client_id::text
    AND source->'blocks' IS NOT DISTINCT FROM projected.body_source
    AND head_subject IS NOT DISTINCT FROM projected.subject AND head_preview IS NOT DISTINCT FROM projected.preview_text
    AND parent_source->'body_source' IS NOT DISTINCT FROM projected.body_source
    AND parent_source->>'body_html' IS NOT DISTINCT FROM projected.body_html THEN RETURN NULL; END IF;
  IF projected.email_design_revision_id IS DISTINCT FROM head_id
    OR source->>'kind' IS DISTINCT FROM 'template'
    OR source->'scope'->>'clientId' IS DISTINCT FROM projected.client_id::text
    OR projected.body_source IS DISTINCT FROM source->'blocks'
    OR projected.subject IS DISTINCT FROM head_subject OR projected.preview_text IS DISTINCT FROM head_preview
    OR html_hash IS NULL OR projected.body_html IS NULL
    OR html_hash IS DISTINCT FROM encode(sha256(convert_to(projected.body_html,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Published template head and projection must commit together'
      USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_design_template_head_projection ON email_design_documents;
CREATE CONSTRAINT TRIGGER email_design_template_head_projection AFTER INSERT OR UPDATE ON email_design_documents
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.template_id IS NOT NULL)
  EXECUTE FUNCTION email_design_check_template_publication_projection();
DROP TRIGGER IF EXISTS email_design_template_publication_projection ON edm_templates;
CREATE CONSTRAINT TRIGGER email_design_template_publication_projection AFTER UPDATE ON edm_templates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION email_design_check_template_publication_projection();
