-- Additive evidence for the existing reviewed dispatcher. Applied 483–485 remain immutable.
BEGIN;
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_media_asset_refs_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_media_asset_refs_check CHECK (
  jsonb_typeof(media_asset_refs) = 'array' AND jsonb_array_length(media_asset_refs) <=
  CASE WHEN cardinality(platforms) = 1 AND platforms[1] = 'tiktok' THEN 35 ELSE 10 END
);
CREATE TABLE IF NOT EXISTS social_post_target_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  post_id UUID NOT NULL REFERENCES social_posts(id),
  revision_id UUID NOT NULL REFERENCES social_post_revisions(id),
  account_id UUID NOT NULL REFERENCES social_accounts(id),
  platform TEXT NOT NULL CHECK (platform = 'tiktok'),
  platform_account_id TEXT NOT NULL,
  target_key TEXT NOT NULL,
  dispatch_attempt INT NOT NULL CHECK (dispatch_attempt > 0),
  publish_id TEXT CHECK (publish_id IS NULL OR publish_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  state TEXT NOT NULL CHECK (state IN ('queued','accepted','published','failed','unknown')),
  provider_status TEXT,
  provider_receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  poll_count INT NOT NULL DEFAULT 0 CHECK (poll_count BETWEEN 0 AND 20),
  next_poll_at TIMESTAMPTZ,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (revision_id, target_key, dispatch_attempt),
  CHECK (state <> 'accepted' OR publish_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS social_target_attempts_due ON social_post_target_attempts(next_poll_at)
  WHERE state = 'accepted';
CREATE OR REPLACE FUNCTION guard_social_target_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.client_id, NEW.post_id, NEW.revision_id, NEW.account_id, NEW.platform,
        NEW.platform_account_id, NEW.target_key, NEW.dispatch_attempt, NEW.created_at)
       IS DISTINCT FROM
       (OLD.client_id, OLD.post_id, OLD.revision_id, OLD.account_id, OLD.platform,
        OLD.platform_account_id, OLD.target_key, OLD.dispatch_attempt, OLD.created_at)
       OR (OLD.publish_id IS NOT NULL AND NEW.publish_id IS DISTINCT FROM OLD.publish_id)
       OR (OLD.state IN ('published','failed','unknown') AND NEW IS DISTINCT FROM OLD)
    THEN RAISE EXCEPTION 'target attempt identity and terminal evidence are immutable'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM social_post_revisions r JOIN social_posts p ON p.id = r.post_id AND p.client_id = r.client_id
      JOIN social_accounts a ON a.id = NEW.account_id AND a.client_id = r.client_id
      WHERE r.id = NEW.revision_id AND r.post_id = NEW.post_id AND r.client_id = NEW.client_id
        AND r.dispatch_attempt = NEW.dispatch_attempt AND r.review_status = 'dispatch_claimed'
        AND r.id = p.current_revision_id AND r.id = p.approved_revision_id
        AND a.platform = NEW.platform AND a.platform_account_id = NEW.platform_account_id AND a.is_active
        AND NEW.target_key = NEW.platform || ':' || NEW.account_id::text
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.snapshot->'targets') t
          WHERE t->>'platform' = NEW.platform AND t->>'accountId' = NEW.account_id::text)
    ) THEN RAISE EXCEPTION 'target attempt does not match the reviewed dispatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS social_target_attempt_guard ON social_post_target_attempts;
CREATE TRIGGER social_target_attempt_guard BEFORE INSERT OR UPDATE ON social_post_target_attempts
  FOR EACH ROW EXECUTE FUNCTION guard_social_target_attempt();
COMMIT;
