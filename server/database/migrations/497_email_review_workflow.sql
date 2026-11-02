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
--
-- Two digests, deliberately separate:
--   * content digest (email_campaign_content_digest[_of]): everything a
--     recipient sees (body, sender, subject/preview, UTM, web-version flag).
--     The hosted web version is signed over it.
--   * review digest (email_campaign_review_digest_of): content digest plus the
--     audience identity (segment rules and target list IDs, not live list
--     membership). Campaign approval binds this one.
-- Approval must come from someone other than the submitter.
-- Content triggers fire only on the reviewed columns and only when a value
-- actually changes, so counter/webhook/status-only updates never hash bodies.
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

-- Row forms take the campaigns row itself (a trigger's NEW row, or `c` in a
-- query), never an id lookup, so a BEFORE trigger digests the proposed row.
CREATE OR REPLACE FUNCTION email_campaign_content_digest_of(c campaigns) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT email_campaign_content_digest(c.body_source, c.body_html, c.subject, c.preview_text,
    c.from_name, c.from_email, c.reply_to, c.utm_settings, c.web_version_enabled)
$$;

-- Target list identities are not columns of the row; they are read as of the
-- calling statement (own uncommitted changes included). Live membership of
-- those lists is not part of approval: the final send freeze (materialized
-- recipients) remains the existing owner of who actually receives it.
CREATE OR REPLACE FUNCTION email_campaign_review_digest_of(c campaigns) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT encode(sha256(convert_to(
    'xf-email-campaign-review:v1;'
    || email_review_digest_part(email_campaign_content_digest_of(c))
    || email_review_digest_part(c.filter_rules::text)
    || email_review_digest_part((SELECT string_agg(cl.list_id::text, ',' ORDER BY cl.list_id)
         FROM campaign_lists cl WHERE cl.campaign_id = c.id)),
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

-- Independent approval: the deciding reviewer is never the submitter.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'email_review_states'::regclass AND conname = 'email_review_states_independent_approval') THEN
    ALTER TABLE email_review_states ADD CONSTRAINT email_review_states_independent_approval CHECK (
      state <> 'approved' OR (submitted_by IS NOT NULL AND decided_by IS DISTINCT FROM submitted_by)
    );
  END IF;
END $$;

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
-- campaign, any attempt to drop the requirement, any change to reviewed content
-- or audience once a gated campaign has left draft, and any entry into a
-- dispatch status from draft or cancelled without an approval of the exact
-- current review digest (computed from the proposed NEW row).
CREATE OR REPLACE FUNCTION email_review_guard_campaign() RETURNS trigger LANGUAGE plpgsql AS $$
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
       NEW.from_name, NEW.from_email, NEW.reply_to, NEW.utm_settings, NEW.web_version_enabled, NEW.filter_rules)
     IS DISTINCT FROM ROW(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text,
       OLD.from_name, OLD.from_email, OLD.reply_to, OLD.utm_settings, OLD.web_version_enabled, OLD.filter_rules) THEN
    RAISE EXCEPTION 'Approved campaign content is frozen'
      USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_content_frozen';
  END IF;
  -- Leaving draft or cancelled for anything else (scheduled, sending, paused,
  -- sent or any future dispatch status) requires approval of the exact current
  -- content and audience. In-flight transitions (scheduled -> sending -> sent)
  -- are not re-checked: their content and audience are frozen above.
  IF OLD.status IN ('draft', 'cancelled') AND NEW.status NOT IN ('draft', 'cancelled') THEN
    IF NOT EXISTS (
      SELECT 1 FROM email_review_states s
      WHERE s.target_kind = 'campaign' AND s.target_id = NEW.id
        AND s.state = 'approved' AND s.content_digest = email_campaign_review_digest_of(NEW)
    ) THEN
      RAISE EXCEPTION 'Campaign content must be approved before it is scheduled or sent'
        USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_approval_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_guard ON campaigns;
DROP TRIGGER IF EXISTS email_review_campaign_guard_insert ON campaigns;
CREATE TRIGGER email_review_campaign_guard_insert BEFORE INSERT ON campaigns
  FOR EACH ROW WHEN (NEW.review_required) EXECUTE FUNCTION email_review_guard_campaign();
-- Only statements that set a reviewed column, the status or the requirement
-- reach the function, and only for gated rows; counters never do.
CREATE TRIGGER email_review_campaign_guard
  BEFORE UPDATE OF review_required, status, body_source, body_html, subject, preview_text,
    from_name, from_email, reply_to, utm_settings, web_version_enabled, filter_rules ON campaigns
  FOR EACH ROW WHEN (OLD.review_required OR NEW.review_required)
  EXECUTE FUNCTION email_review_guard_campaign();

-- A draft mutation of reviewed content or audience returns an in-review or
-- approved decision to draft, for every entrypoint. TG_ARGV[0] is the target
-- kind. The WHEN clauses below admit only real value changes, so no digest is
-- computed here at all.
CREATE OR REPLACE FUNCTION email_review_invalidate_on_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE email_review_states
  SET state = 'draft', content_digest = NULL, version = version + 1,
      decided_by = NULL, decided_at = NULL,
      note = 'Content changed after review; resubmit for review.', updated_at = now()
  WHERE target_kind = TG_ARGV[0] AND target_id = NEW.id AND state <> 'draft';
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_invalidate ON campaigns;
CREATE TRIGGER email_review_campaign_invalidate
  AFTER UPDATE OF body_source, body_html, subject, preview_text, from_name, from_email, reply_to,
    utm_settings, web_version_enabled, filter_rules ON campaigns
  FOR EACH ROW WHEN (ROW(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text, OLD.from_name,
      OLD.from_email, OLD.reply_to, OLD.utm_settings, OLD.web_version_enabled, OLD.filter_rules)
    IS DISTINCT FROM ROW(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text, NEW.from_name,
      NEW.from_email, NEW.reply_to, NEW.utm_settings, NEW.web_version_enabled, NEW.filter_rules))
  EXECUTE FUNCTION email_review_invalidate_on_change('campaign');
DROP TRIGGER IF EXISTS email_review_template_invalidate ON edm_templates;
CREATE TRIGGER email_review_template_invalidate
  AFTER UPDATE OF body_source, body_html, subject, preview_text, email_design_revision_id ON edm_templates
  FOR EACH ROW WHEN (ROW(OLD.body_source, OLD.body_html, OLD.subject, OLD.preview_text, OLD.email_design_revision_id)
    IS DISTINCT FROM ROW(NEW.body_source, NEW.body_html, NEW.subject, NEW.preview_text, NEW.email_design_revision_id))
  EXECUTE FUNCTION email_review_invalidate_on_change('template');

-- Target lists are the other half of the audience. A direct list change on a
-- gated campaign that has left draft is refused. Lock order matches the review
-- command and status updates: campaigns row first, then review state.
-- pg_trigger_depth() > 1 means a foreign-key cascade (an email list or the
-- campaign itself being deleted), which is not an audience edit of this
-- campaign: its recipients were materialized when it left draft.
CREATE OR REPLACE FUNCTION email_review_guard_campaign_lists() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; campaign record;
BEGIN
  IF pg_trigger_depth() = 1 THEN
    FOR target IN SELECT DISTINCT id FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.campaign_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.campaign_id END]) AS ids(id) WHERE id IS NOT NULL
    LOOP
      SELECT c.status, c.review_required INTO campaign FROM campaigns c WHERE c.id = target FOR NO KEY UPDATE;
      IF FOUND AND campaign.review_required AND campaign.status <> 'draft' THEN
        RAISE EXCEPTION 'Approved campaign audience is frozen'
          USING ERRCODE = '55000', CONSTRAINT = 'email_campaign_content_frozen';
      END IF;
    END LOOP;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_lists_guard ON campaign_lists;
CREATE TRIGGER email_review_campaign_lists_guard BEFORE INSERT OR UPDATE OR DELETE ON campaign_lists
  FOR EACH ROW EXECUTE FUNCTION email_review_guard_campaign_lists();

-- Draft audience changes invalidate at commit, compared against the stored
-- decision: replacing the lists with the identical set (delete + re-insert) is
-- a no-op, while any different set or segment returns the review to draft.
-- Frozen (non-draft) campaigns keep their decision record.
CREATE OR REPLACE FUNCTION email_review_invalidate_campaign_lists() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; current_digest text;
BEGIN
  FOR target IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.campaign_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.campaign_id END]) AS ids(id) WHERE id IS NOT NULL
  LOOP
    SELECT email_campaign_review_digest_of(c) INTO current_digest
    FROM campaigns c WHERE c.id = target AND c.status = 'draft' FOR NO KEY UPDATE;
    IF FOUND THEN
      UPDATE email_review_states
      SET state = 'draft', content_digest = NULL, version = version + 1,
          decided_by = NULL, decided_at = NULL,
          note = 'Audience changed after review; resubmit for review.', updated_at = now()
      WHERE target_kind = 'campaign' AND target_id = target AND state <> 'draft'
        AND content_digest IS DISTINCT FROM current_digest;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS email_review_campaign_lists_invalidate ON campaign_lists;
CREATE CONSTRAINT TRIGGER email_review_campaign_lists_invalidate AFTER INSERT OR UPDATE OR DELETE ON campaign_lists
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION email_review_invalidate_campaign_lists();
