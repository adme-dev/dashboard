-- Opt-in campaign projection foundation. No backfill or activation; independent
-- of 497 review workflow. Existing source-only/legacy/frozen HTML is untouched.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_design_revision_id uuid REFERENCES email_design_revisions(id) ON DELETE RESTRICT;
ALTER TABLE email_design_revisions ADD COLUMN IF NOT EXISTS base_template_revision_id uuid REFERENCES email_design_revisions(id) ON DELETE RESTRICT;
ALTER TABLE email_design_revisions ADD COLUMN IF NOT EXISTS rendered_html_sha256 text CHECK (rendered_html_sha256 IS NULL OR rendered_html_sha256 ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION email_design_check_campaign_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_client uuid; owner_status text; parent_pin uuid; parent_version integer;
BEGIN
  SELECT d.client_id,c.status INTO owner_client,owner_status FROM email_design_documents d
    JOIN campaigns c ON c.id=d.campaign_id WHERE d.id=NEW.document_id FOR UPDATE OF c;
  IF NOT FOUND THEN
    IF NEW.base_template_revision_id IS NOT NULL OR NEW.rendered_html_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'Campaign projection metadata requires a campaign owner' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.schema_version<>1 THEN
    IF NEW.base_template_revision_id IS NOT NULL OR NEW.rendered_html_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy snapshots cannot claim canonical projection metadata' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF owner_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Campaign authoring requires draft status' USING ERRCODE='55000', CONSTRAINT='email_design_campaign_frozen';
  END IF;
  -- Generated payload is not populated in a BEFORE INSERT trigger.
  IF NEW.payload_text::jsonb->>'kind' IS DISTINCT FROM 'campaign-draft'
    OR NEW.payload_text::jsonb->'scope'->>'clientId' IS DISTINCT FROM owner_client::text THEN
    RAISE EXCEPTION 'Campaign design scope or kind mismatch' USING ERRCODE='55000';
  END IF;
  IF NEW.base_template_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id
      WHERE r.id=NEW.base_template_revision_id AND r.schema_version=1 AND d.template_id IS NOT NULL
      AND (d.client_id IS NULL OR d.client_id=owner_client)
  ) THEN
    RAISE EXCEPTION 'Base pin must name an in-scope template revision' USING ERRCODE='55000', CONSTRAINT='email_design_base_template_required';
  END IF;
  SELECT schema_version,base_template_revision_id INTO parent_version,parent_pin FROM email_design_revisions WHERE id=NEW.parent_revision_id;
  -- Template selection/update is a separate explicit owner operation. Ordinary
  -- successors cannot silently propagate a newer template (including null pins).
  IF parent_version=1 AND NEW.base_template_revision_id IS DISTINCT FROM parent_pin THEN
    RAISE EXCEPTION 'Ordinary successor must preserve the base template pin' USING ERRCODE='55000', CONSTRAINT='email_design_base_template_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_campaign_revision ON email_design_revisions;
CREATE TRIGGER email_design_campaign_revision BEFORE INSERT ON email_design_revisions FOR EACH ROW EXECUTE FUNCTION email_design_check_campaign_revision();

CREATE OR REPLACE FUNCTION email_design_protect_campaign_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head_id uuid; source jsonb; version integer; head_subject text; head_preview text; html_hash text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.email_design_revision_id IS NULL AND NEW.email_design_revision_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NEW.email_design_revision_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.body_source,NEW.body_html,NEW.subject,NEW.preview_text,NEW.email_design_revision_id)
    IS NOT DISTINCT FROM ROW(OLD.body_source,OLD.body_html,OLD.subject,OLD.preview_text,OLD.email_design_revision_id) THEN RETURN NEW; END IF;
  SELECT r.id,r.payload,r.schema_version,r.subject,r.preview_text,r.rendered_html_sha256
    INTO head_id,source,version,head_subject,head_preview,html_hash
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id AND r.document_id=d.id WHERE d.campaign_id=NEW.id;
  IF NOT FOUND OR version<>1 OR NEW.status IS DISTINCT FROM 'draft'
    OR (TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM 'draft')
    OR NEW.email_design_revision_id IS DISTINCT FROM head_id
    OR (TG_OP='UPDATE' AND NEW.email_design_revision_id IS NOT DISTINCT FROM OLD.email_design_revision_id)
    OR NEW.body_source IS DISTINCT FROM source->'blocks'
    OR NEW.subject IS DISTINCT FROM head_subject OR NEW.preview_text IS DISTINCT FROM head_preview
    OR html_hash IS NULL OR NEW.body_html IS NULL
    OR html_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.body_html,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Reload the versioned campaign draft before editing'
      USING ERRCODE='55000', CONSTRAINT='email_design_campaign_revision_required';
  END IF;
  RETURN NEW;
END $$;
-- Filter at the trigger boundary: counters, webhook tallies and status-only
-- updates must not invoke projection checks. INSERT has no OLD row to compare.
DROP TRIGGER IF EXISTS email_design_campaign_projection ON campaigns;
DROP TRIGGER IF EXISTS email_design_campaign_projection_insert ON campaigns;
CREATE TRIGGER email_design_campaign_projection_insert BEFORE INSERT ON campaigns
  FOR EACH ROW WHEN (NEW.email_design_revision_id IS NOT NULL)
  EXECUTE FUNCTION email_design_protect_campaign_projection();
CREATE TRIGGER email_design_campaign_projection
  BEFORE UPDATE OF email_design_revision_id, body_source, body_html, subject, preview_text ON campaigns
  FOR EACH ROW WHEN ((OLD.email_design_revision_id IS NOT NULL OR NEW.email_design_revision_id IS NOT NULL)
    AND ROW(OLD.email_design_revision_id, OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text)
      IS DISTINCT FROM ROW(NEW.email_design_revision_id, NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text))
  EXECUTE FUNCTION email_design_protect_campaign_projection();

CREATE OR REPLACE FUNCTION email_design_check_campaign_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE campaign uuid; pointer uuid; head_id uuid; source jsonb; head_subject text; head_preview text; html_hash text; projected campaigns%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='email_design_documents' THEN campaign:=NEW.campaign_id; ELSE campaign:=NEW.id; END IF;
  IF campaign IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO projected FROM campaigns WHERE id=campaign;
  pointer:=projected.email_design_revision_id;
  -- Existing source-only documents never opt in merely by existing.
  IF pointer IS NULL THEN RETURN NULL; END IF;
  SELECT r.id,r.payload,r.subject,r.preview_text,r.rendered_html_sha256 INTO head_id,source,head_subject,head_preview,html_hash
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id AND r.document_id=d.id
    WHERE d.campaign_id=campaign AND r.schema_version=1;
  IF NOT FOUND OR pointer IS DISTINCT FROM head_id OR projected.body_source IS DISTINCT FROM source->'blocks'
    OR projected.subject IS DISTINCT FROM head_subject OR projected.preview_text IS DISTINCT FROM head_preview
    OR html_hash IS NULL OR projected.body_html IS NULL
    OR html_hash IS DISTINCT FROM encode(sha256(convert_to(projected.body_html,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Campaign head and projection must commit together'
      USING ERRCODE='55000', CONSTRAINT='email_design_campaign_projection_consistent';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_design_campaign_head_projection ON email_design_documents;
CREATE CONSTRAINT TRIGGER email_design_campaign_head_projection AFTER INSERT OR UPDATE ON email_design_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION email_design_check_campaign_projection();
DROP TRIGGER IF EXISTS email_design_campaign_projection_consistent ON campaigns;
DROP TRIGGER IF EXISTS email_design_campaign_projection_consistent_insert ON campaigns;
CREATE CONSTRAINT TRIGGER email_design_campaign_projection_consistent_insert AFTER INSERT ON campaigns
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.email_design_revision_id IS NOT NULL)
  EXECUTE FUNCTION email_design_check_campaign_projection();
-- WHEN is evaluated as the row changes, so no deferred event is enqueued for
-- unchanged projections, even if the UPDATE statement names these columns.
CREATE CONSTRAINT TRIGGER email_design_campaign_projection_consistent
  AFTER UPDATE OF email_design_revision_id, body_source, body_html, subject, preview_text ON campaigns
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.email_design_revision_id IS NOT NULL OR NEW.email_design_revision_id IS NOT NULL)
    AND ROW(OLD.email_design_revision_id, OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text)
      IS DISTINCT FROM ROW(NEW.email_design_revision_id, NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text))
  EXECUTE FUNCTION email_design_check_campaign_projection();
