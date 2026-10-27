-- 483_social_post_revision_review.sql
-- Revision-bound, independent review for delegated (staff/MCP) social posts.
--
-- Additive only:
--  * social_posts gains a server-controlled review policy, typed media asset references and pointers
--    to the current / approved / client-approved immutable revision. Existing rows default to
--    review_policy='legacy' and keep their current browser approval behaviour.
--  * social_post_revisions stores one immutable snapshot (canonical JSON + SHA-256) per submission.
--    After insert only the review lifecycle columns may change, through an explicit state machine,
--    and a delegated revision can never be approved by its own requester.
--  * The social_posts status check gains 'accepted' (provider accepted, receipt pending) and
--    'unknown' (indeterminate provider outcome, held for read-back; never auto-retried).
--
-- Rollback (manual, only after reverting application code and cancelling delegated drafts):
--   UPDATE social_posts SET status='cancelled' WHERE review_policy='delegated_marketing'
--     AND status NOT IN ('published','partially_published','cancelled');
--   DROP TABLE social_post_revisions; DROP FUNCTION guard_social_post_revision_write();
--   ALTER TABLE social_posts DROP COLUMN review_policy, DROP COLUMN media_asset_refs,
--     DROP COLUMN current_revision_id, DROP COLUMN approved_revision_id,
--     DROP COLUMN client_approval_revision_id;
--   Restore the previous status check only when no row uses 'accepted' or 'unknown'.

BEGIN;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS review_policy TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS media_asset_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_revision_id UUID,
  ADD COLUMN IF NOT EXISTS approved_revision_id UUID,
  ADD COLUMN IF NOT EXISTS client_approval_revision_id UUID;

DO $$
BEGIN
  ALTER TABLE social_posts
    ADD CONSTRAINT social_posts_review_policy_check
    CHECK (review_policy IN ('legacy', 'delegated_marketing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE social_posts
    ADD CONSTRAINT social_posts_media_asset_refs_check
    CHECK (jsonb_typeof(media_asset_refs) = 'array' AND jsonb_array_length(media_asset_refs) <= 10);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replace the status check (inline/unnamed in 145, so locate it by definition) with a superset.
DO $$
DECLARE
  existing RECORD;
BEGIN
  FOR existing IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'social_posts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%partially_published%'
  LOOP
    EXECUTE format('ALTER TABLE social_posts DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END $$;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_status_check CHECK (status IN (
    'draft', 'approved', 'scheduled', 'publishing', 'accepted', 'published',
    'partially_published', 'failed', 'unknown', 'cancelled'
  )) NOT VALID;
ALTER TABLE social_posts VALIDATE CONSTRAINT social_posts_status_check;

CREATE TABLE IF NOT EXISTS social_post_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  review_policy TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  snapshot JSONB NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  dispatch_claimed_at TIMESTAMPTZ,
  dispatch_attempt INT NOT NULL DEFAULT 0,
  dispatch_outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_post_revisions_number_unique UNIQUE (post_id, revision_number),
  CONSTRAINT social_post_revisions_number_check CHECK (revision_number > 0),
  CONSTRAINT social_post_revisions_policy_check
    CHECK (review_policy IN ('legacy', 'delegated_marketing')),
  CONSTRAINT social_post_revisions_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT social_post_revisions_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT social_post_revisions_requester_check CHECK (char_length(requested_by) BETWEEN 1 AND 128),
  CONSTRAINT social_post_revisions_status_check CHECK (review_status IN (
    'pending', 'approved', 'rejected', 'superseded', 'expired', 'dispatch_claimed'
  )),
  CONSTRAINT social_post_revisions_reason_check
    CHECK (review_reason IS NULL OR char_length(review_reason) <= 4000),
  CONSTRAINT social_post_revisions_attempt_check CHECK (dispatch_attempt >= 0),
  CONSTRAINT social_post_revisions_outcome_check CHECK (dispatch_outcome IS NULL OR dispatch_outcome IN (
    'accepted', 'published', 'partially_published', 'failed', 'unknown'
  )),
  CONSTRAINT social_post_revisions_review_fields_check CHECK (
    (review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR review_status IN ('superseded', 'expired')
    OR (review_status IN ('approved', 'rejected', 'dispatch_claimed') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  -- Separation of duties for the delegated workflow, enforced below the application as well.
  CONSTRAINT social_post_revisions_independent_review_check CHECK (
    review_policy <> 'delegated_marketing' OR reviewed_by IS NULL OR reviewed_by <> requested_by
  )
);

CREATE INDEX IF NOT EXISTS idx_social_post_revisions_client_review
  ON social_post_revisions (client_id, review_status, requested_at);
CREATE INDEX IF NOT EXISTS idx_social_post_revisions_post
  ON social_post_revisions (post_id, revision_number DESC);
-- At most one live (reviewable or approved, unclaimed) revision per post. A dispatch-claimed revision
-- is consumed: after a failed dispatch the edited draft may be resubmitted as a new revision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_revisions_live
  ON social_post_revisions (post_id)
  WHERE review_status IN ('pending', 'approved');

CREATE OR REPLACE FUNCTION guard_social_post_revision_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  post_client UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT client_id INTO post_client FROM social_posts WHERE id = NEW.post_id;
    IF post_client IS NULL OR post_client <> NEW.client_id THEN
      RAISE EXCEPTION 'social post revision client does not match its post'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.review_status <> 'pending' OR NEW.dispatch_claimed_at IS NOT NULL
       OR NEW.dispatch_attempt <> 0 OR NEW.dispatch_outcome IS NOT NULL THEN
      RAISE EXCEPTION 'social post revisions start pending and unclaimed'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.post_id IS DISTINCT FROM OLD.post_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
     OR NEW.review_policy IS DISTINCT FROM OLD.review_policy
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'social post revision snapshots are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_status IS DISTINCT FROM OLD.review_status AND NOT (
    (OLD.review_status = 'pending' AND NEW.review_status IN ('approved', 'rejected', 'superseded', 'expired'))
    OR (OLD.review_status = 'approved' AND NEW.review_status IN ('dispatch_claimed', 'superseded', 'expired'))
  ) THEN
    RAISE EXCEPTION 'invalid social post revision transition % -> %', OLD.review_status, NEW.review_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.review_status <> 'pending'
     AND (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason) THEN
    RAISE EXCEPTION 'social post revision decisions are final'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.dispatch_claimed_at IS NOT NULL AND NEW.dispatch_claimed_at IS DISTINCT FROM OLD.dispatch_claimed_at THEN
    RAISE EXCEPTION 'social post revision dispatch claims are single-use'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.dispatch_attempt < OLD.dispatch_attempt THEN
    RAISE EXCEPTION 'social post revision attempts only increase'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.dispatch_outcome IS NOT NULL AND NEW.dispatch_outcome IS DISTINCT FROM OLD.dispatch_outcome THEN
    RAISE EXCEPTION 'social post revision dispatch outcomes are final'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_social_post_revision_write ON social_post_revisions;
CREATE TRIGGER trg_guard_social_post_revision_write
  BEFORE INSERT OR UPDATE ON social_post_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_social_post_revision_write();

COMMIT;
