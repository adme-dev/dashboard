-- M06 email review workflow: block comments, draft → in_review → approved,
-- exact-content approval enforced by the database on every entrypoint
-- (REST, MCP department operations, cron dispatch, raw SQL), campaign UTM
-- settings and the opt-in hosted web version. Additive and idempotent.
--
-- Legacy handling: existing campaigns keep review_required = false. Their
-- scheduled/sending/sent frozen snapshots are never rewritten and are never
-- reclassified as approved (no review rows are backfilled). Only campaigns
-- created while FIGFLOW_EDM_WORKFLOW_ENABLED is on (or explicitly opted in)
-- are gated, and that requirement can never be cleared.
-- Coordinator applies this migration; workers do not mutate shared databases.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS web_version_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_settings jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_utm_settings_shape') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_utm_settings_shape CHECK (
      utm_settings IS NULL OR (jsonb_typeof(utm_settings) = 'object' AND octet_length(utm_settings::text) <= 1024)
    );
  END IF;
END $$;

-- One canonical, length-prefixed digest of everything a recipient receives
-- from the frozen campaign row. Computed only by the database, never accepted
-- from a browser or JSON body. jsonb text output is canonical for equal values.
CREATE OR REPLACE FUNCTION email_review_digest_part(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN value IS NULL THEN 'N;' ELSE 'S' || octet_length(value) || ':' || value || ';' END
$$;

CREATE OR REPLACE FUNCTION email_campaign_content_digest(
  body_source jsonb, body_html text, subject text, preview_text text,
  from_name text, from_email text, reply_to text, utm_settings jsonb, web_version_enabled boolean
) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(sha256(convert_to(
    'xf-email-campaign-content:v1;'
    || email_review_digest_part(body_source::text)
    || email_review_digest_part(body_html)
    || email_review_digest_part(subject)
    || email_review_digest_part(preview_text)
    || email_review_digest_part(from_name)
    || email_review_digest_part(from_email)
    || email_review_digest_part(reply_to)
    || email_review_digest_part(utm_settings::text)
    || email_review_digest_part(CASE WHEN web_version_enabled THEN 'web' ELSE 'none' END),
    'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION email_template_content_digest(
  body_source jsonb, body_html text, subject text, preview_text text, revision_id uuid
) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(sha256(convert_to(
    'xf-email-template-content:v1;'
    || email_review_digest_part(body_source::text)
    || email_review_digest_part(body_html)
    || email_review_digest_part(subject)
    || email_review_digest_part(preview_text)
    || email_review_digest_part(revision_id::text),
    'UTF8')), 'hex')
$$;

CREATE TABLE IF NOT EXISTS email_review_states (
  target_kind text NOT NULL CHECK (target_kind IN ('template', 'campaign')),
  target_id uuid NOT NULL,
  client_id uuid,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'in_review', 'approved')),
  content_digest text CHECK (content_digest IS NULL OR content_digest ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  submitted_by uuid,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id),
  CHECK (state = 'draft' OR content_digest IS NOT NULL),
  CHECK (state <> 'approved' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS email_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('template', 'campaign')),
  target_id uuid NOT NULL,
  client_id uuid,
  block_id text CHECK (block_id IS NULL OR block_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  revision_id uuid,
  parent_id uuid REFERENCES email_review_comments(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  author_id uuid NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE INDEX IF NOT EXISTS email_review_comments_target ON email_review_comments(target_kind, target_id, created_at);

CREATE TABLE IF NOT EXISTS email_review_operations (
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  domain text NOT NULL CHECK (domain = 'email_review'),
  command text NOT NULL CHECK (command ~ '^[a-z_]{1,40}$'),
  target_kind text NOT NULL CHECK (target_kind IN ('template', 'campaign')),
  target_id uuid NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id)
);

CREATE OR REPLACE FUNCTION email_review_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Email review records are immutable' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS email_review_operation_immutable ON email_review_operations;
CREATE TRIGGER email_review_operation_immutable BEFORE UPDATE OR DELETE ON email_review_operations
  FOR EACH ROW EXECUTE FUNCTION email_review_reject_mutation();
DROP TRIGGER IF EXISTS email_review_operation_no_truncate ON email_review_operations;
CREATE TRIGGER email_review_operation_no_truncate BEFORE TRUNCATE ON email_review_operations
  FOR EACH STATEMENT EXECUTE FUNCTION email_review_reject_mutation();

-- Comments are append-only: lineage (target, block, content identity, author,
-- body) is never reassigned; only resolution may change. Deleted blocks stay
-- explicitly orphaned at read time.
CREATE OR REPLACE FUNCTION email_review_protect_comment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Email review comments cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF ROW(NEW.id, NEW.target_kind, NEW.target_id, NEW.client_id, NEW.block_id, NEW.content_digest,
         NEW.revision_id, NEW.parent_id, NEW.body, NEW.author_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.target_kind, OLD.target_id, OLD.client_id, OLD.block_id, OLD.content_digest,
         OLD.revision_id, OLD.parent_id, OLD.body, OLD.author_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Email review comment lineage is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_review_comment_lineage ON email_review_comments;
CREATE TRIGGER email_review_comment_lineage BEFORE UPDATE OR DELETE ON email_review_comments
  FOR EACH ROW EXECUTE FUNCTION email_review_protect_comment();

CREATE OR REPLACE FUNCTION email_review_check_reply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM email_review_comments p
    WHERE p.id = NEW.parent_id AND p.parent_id IS NULL
      AND p.target_kind = NEW.target_kind AND p.target_id = NEW.target_id
      AND p.block_id IS NOT DISTINCT FROM NEW.block_id
  ) THEN
    RAISE EXCEPTION 'Replies must stay in their thread' USING ERRCODE = '55000', CONSTRAINT = 'email_review_reply_thread';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_review_comment_reply ON email_review_comments;
CREATE TRIGGER email_review_comment_reply BEFORE INSERT ON email_review_comments
  FOR EACH ROW EXECUTE FUNCTION email_review_check_reply();

-- Universal campaign gate. Raises before any non-draft insert of a gated
-- campaign, any attempt to drop the requirement, any entry into scheduled or
-- any dispatch status without an approval of the exact current content, and any content
-- change once a gated campaign has left draft.
CREATE OR REPLACE FUNCTION email_review_guard_campaign() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE digest text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_required AND NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Reviewed campaigns start as drafts'
        USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_approval_required';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.review_required AND NOT NEW.review_required THEN
    RAISE EXCEPTION 'Campaign review requirement cannot be removed'
      USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_review_permanent';
  END IF;
  IF NOT NEW.review_required THEN RETURN NEW; END IF;
  IF OLD.status <> 'draft' AND ROW(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text,
       NEW.from_name, NEW.from_email, NEW.reply_to, NEW.utm_settings, NEW.web_version_enabled)
     IS DISTINCT FROM ROW(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text,
       OLD.from_name, OLD.from_email, OLD.reply_to, OLD.utm_settings, OLD.web_version_enabled) THEN
    RAISE EXCEPTION 'Approved campaign content is frozen'
      USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_content_frozen';
  END IF;
  -- Leaving draft for anything but cancellation (scheduled, sending, or any
  -- future dispatch status) requires approval of the exact current content.
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'cancelled') THEN
    digest := email_campaign_content_digest(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text,
      NEW.from_name, NEW.from_email, NEW.reply_to, NEW.utm_settings, NEW.web_version_enabled);
    IF NOT EXISTS (
      SELECT 1 FROM email_review_states s
      WHERE s.target_kind = 'campaign' AND s.target_id = NEW.id
        AND s.state = 'approved' AND s.content_digest = digest
    ) THEN
      RAISE EXCEPTION 'Campaign content must be approved before it is scheduled or sent'
        USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_approval_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_guard ON campaigns;
CREATE TRIGGER email_review_campaign_guard BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION email_review_guard_campaign();

-- Any relevant draft mutation invalidates an in-review or approved decision,
-- for both campaigns and templates, regardless of which entrypoint wrote it.
CREATE OR REPLACE FUNCTION email_review_invalidate_on_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; before_digest text; after_digest text;
BEGIN
  IF TG_TABLE_NAME = 'campaigns' THEN
    kind := 'campaign';
    before_digest := email_campaign_content_digest(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text,
      OLD.from_name, OLD.from_email, OLD.reply_to, OLD.utm_settings, OLD.web_version_enabled);
    after_digest := email_campaign_content_digest(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text,
      NEW.from_name, NEW.from_email, NEW.reply_to, NEW.utm_settings, NEW.web_version_enabled);
  ELSE
    kind := 'template';
    before_digest := email_template_content_digest(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text, OLD.email_design_revision_id);
    after_digest := email_template_content_digest(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text, NEW.email_design_revision_id);
  END IF;
  IF before_digest IS DISTINCT FROM after_digest THEN
    UPDATE email_review_states
    SET state = 'draft', content_digest = NULL, version = version + 1,
        decided_by = NULL, decided_at = NULL,
        note = 'Content changed after review; resubmit for review.', updated_at = now()
    WHERE target_kind = kind AND target_id = NEW.id AND state <> 'draft';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_invalidate ON campaigns;
CREATE TRIGGER email_review_campaign_invalidate AFTER UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION email_review_invalidate_on_change();
DROP TRIGGER IF EXISTS email_review_template_invalidate ON edm_templates;
CREATE TRIGGER email_review_template_invalidate AFTER UPDATE ON edm_templates
  FOR EACH ROW EXECUTE FUNCTION email_review_invalidate_on_change();
