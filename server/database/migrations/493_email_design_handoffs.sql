-- Durable proposals reference the existing canonical revision owner. No second
-- template library, publishing table or send path is introduced.
CREATE TABLE IF NOT EXISTS email_design_handoffs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  document_id uuid NOT NULL,
  base_revision_id uuid NOT NULL,
  open_revision_id uuid NOT NULL,
  editor_origin text NOT NULL CHECK (editor_origin = 'https://creative.xeroflow.io'),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','proposed','applied','cancelled')),
  proposal_revision_id uuid,
  proposal_operation_id uuid,
  proposal_action_text text CHECK (octet_length(proposal_action_text) <= 2162688),
  proposal_payload_text text CHECK (octet_length(proposal_payload_text) <= 2097152),
  applied_revision_id uuid,
  apply_action_text text,
  cancel_action_text text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  FOREIGN KEY (document_id, base_revision_id) REFERENCES email_design_revisions(document_id,id),
  FOREIGN KEY (document_id, open_revision_id) REFERENCES email_design_revisions(document_id,id),
  FOREIGN KEY (document_id, applied_revision_id) REFERENCES email_design_revisions(document_id,id),
  CHECK ((state='open' AND proposal_revision_id IS NULL AND proposal_payload_text IS NULL)
    OR (state<>'open' AND proposal_revision_id IS NOT NULL AND proposal_payload_text IS NOT NULL)),
  CHECK ((state='applied') = (applied_revision_id IS NOT NULL)),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS email_design_handoff_actor_document
  ON email_design_handoffs(actor_id, document_id, created_at DESC);
CREATE OR REPLACE FUNCTION email_design_protect_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.actor_id,NEW.document_id,NEW.base_revision_id,NEW.open_revision_id,NEW.editor_origin,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.actor_id,OLD.document_id,OLD.base_revision_id,OLD.open_revision_id,OLD.editor_origin,OLD.created_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'Email handoff identity is immutable' USING ERRCODE='55000';
  END IF;
  IF OLD.state <> 'open' AND ROW(NEW.proposal_revision_id,NEW.proposal_operation_id,NEW.proposal_action_text,NEW.proposal_payload_text)
    IS DISTINCT FROM ROW(OLD.proposal_revision_id,OLD.proposal_operation_id,OLD.proposal_action_text,OLD.proposal_payload_text) THEN
    RAISE EXCEPTION 'Email proposal is immutable' USING ERRCODE='55000';
  END IF;
  IF (OLD.state='open' AND NEW.state<>'proposed')
    OR (OLD.state='proposed' AND NEW.state NOT IN ('applied','cancelled'))
    OR OLD.state IN ('applied','cancelled') THEN
    RAISE EXCEPTION 'Invalid email handoff transition' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_design_handoff_transition ON email_design_handoffs;
CREATE TRIGGER email_design_handoff_transition BEFORE UPDATE ON email_design_handoffs
  FOR EACH ROW EXECUTE FUNCTION email_design_protect_handoff();

-- One operation identity is bound to the complete handoff command and target.
-- Receipts survive terminal transitions and are committed with the effect.
CREATE TABLE IF NOT EXISTS email_design_handoff_receipts (
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  handoff_id uuid NOT NULL REFERENCES email_design_handoffs(id),
  request_text text NOT NULL CHECK (octet_length(request_text) <= 2166784),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id, operation_id)
);
DROP TRIGGER IF EXISTS email_design_handoff_receipt_immutable ON email_design_handoff_receipts;
CREATE TRIGGER email_design_handoff_receipt_immutable BEFORE UPDATE OR DELETE ON email_design_handoff_receipts
  FOR EACH ROW EXECUTE FUNCTION email_design_reject_revision_mutation();
DROP TRIGGER IF EXISTS email_design_handoff_receipt_no_truncate ON email_design_handoff_receipts;
CREATE TRIGGER email_design_handoff_receipt_no_truncate BEFORE TRUNCATE ON email_design_handoff_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION email_design_reject_revision_mutation();
