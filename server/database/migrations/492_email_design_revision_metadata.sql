-- Immutable render metadata; deploy with the versioned metadata saver.
ALTER TABLE email_design_revisions ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE email_design_revisions ADD COLUMN IF NOT EXISTS preview_text text;

CREATE OR REPLACE FUNCTION email_design_protect_template_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head_id uuid; source jsonb; version integer; head_subject text; head_preview text;
BEGIN
  SELECT r.id,r.payload,r.schema_version,r.subject,r.preview_text INTO head_id,source,version,head_subject,head_preview
    FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id
    WHERE d.template_id=OLD.id;
  IF NOT FOUND OR version<>1 THEN RETURN NEW; END IF;
  IF ROW(NEW.body_source,NEW.body_html,NEW.subject,NEW.preview_text,NEW.template_kind,NEW.email_design_revision_id)
    IS DISTINCT FROM ROW(OLD.body_source,OLD.body_html,OLD.subject,OLD.preview_text,OLD.template_kind,OLD.email_design_revision_id) THEN
    IF NEW.email_design_revision_id IS NOT DISTINCT FROM OLD.email_design_revision_id
      OR NEW.email_design_revision_id IS DISTINCT FROM head_id
      OR NEW.body_source IS DISTINCT FROM source->'blocks'
      OR NEW.template_kind IS DISTINCT FROM 'draft'
      OR NEW.subject IS DISTINCT FROM head_subject
      OR NEW.preview_text IS DISTINCT FROM head_preview THEN
      RAISE EXCEPTION 'Reload the versioned email draft before editing'
        USING ERRCODE='55000', CONSTRAINT='email_design_revision_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
