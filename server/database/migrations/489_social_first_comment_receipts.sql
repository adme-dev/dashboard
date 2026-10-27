-- Preserve publication evidence before the optional first-comment request.
-- Initial receipt's firstComment:unknown reserves one attempt; no retry authority is created.
BEGIN;
CREATE TABLE social_post_first_comment_receipts (
  attempt_id UUID PRIMARY KEY REFERENCES social_post_target_attempts(id),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION guard_social_first_comment_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'first comment receipt is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM social_post_target_attempts a
    JOIN social_post_target_receipts i ON i.attempt_id=a.id
    JOIN social_post_revisions r ON r.id=a.revision_id AND r.post_id=a.post_id AND r.client_id=a.client_id
    WHERE a.id=NEW.attempt_id AND r.dispatch_attempt=a.dispatch_attempt AND r.review_status='dispatch_claimed'
      AND i.result->>'status'='success' AND NULLIF(i.result->>'platformPostId','') IS NOT NULL
      AND i.result->'firstComment'->>'status'='unknown'
      AND NEW.result->>'status' IN ('success','failed','unknown','skipped')
      AND (NEW.result->>'status'<>'success' OR NULLIF(NEW.result->>'platformPostId','') IS NOT NULL)
  ) THEN RAISE EXCEPTION 'comment receipt does not match the reviewed publication attempt'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER social_first_comment_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON social_post_first_comment_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_social_first_comment_receipt();
COMMIT;
