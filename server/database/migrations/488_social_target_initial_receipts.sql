-- Additive correction to 486/487: every reviewed target participates in aggregation.
-- Late init evidence is append-only and cannot rewrite a terminal target attempt.
BEGIN;
ALTER TABLE social_post_target_attempts DROP CONSTRAINT social_post_target_attempts_platform_check;
ALTER TABLE social_post_target_attempts ADD CONSTRAINT social_post_target_attempts_platform_check
  CHECK (platform IN ('facebook','instagram','linkedin','tiktok'));
CREATE TABLE social_post_target_receipts (
  attempt_id UUID PRIMARY KEY REFERENCES social_post_target_attempts(id),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION guard_social_target_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'initial target receipt is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM social_post_target_attempts a
    JOIN social_post_revisions r ON r.id=a.revision_id AND r.post_id=a.post_id AND r.client_id=a.client_id
    WHERE a.id=NEW.attempt_id AND r.dispatch_attempt=a.dispatch_attempt AND r.review_status='dispatch_claimed'
      AND NEW.result->>'platform'=a.platform AND NEW.result->>'accountId'=a.account_id::text
      AND NEW.result->>'platformAccountId'=a.platform_account_id
      AND NEW.result->>'status' IN ('success','accepted','failed','unknown')
  ) THEN RAISE EXCEPTION 'receipt does not match the reviewed target attempt'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER social_target_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON social_post_target_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_social_target_receipt();
COMMIT;
