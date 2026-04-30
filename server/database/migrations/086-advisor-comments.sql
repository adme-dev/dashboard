-- 086: Advisor recommendation comments
-- Slice 4 of the advisor triage phase.
--
-- Soft-delete via deleted_at so the existing recommendation_events
-- audit log can still reference comment ids without dangling FKs.
-- Flat (no parent_id); threaded discussion is out of scope for this
-- phase.

CREATE TABLE IF NOT EXISTS recommendation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  author_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reco_comments_rec
  ON recommendation_comments(recommendation_id, created_at)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_reco_comments_updated_at ON recommendation_comments;
CREATE TRIGGER trg_reco_comments_updated_at
  BEFORE UPDATE ON recommendation_comments
  FOR EACH ROW EXECUTE FUNCTION recommendations_touch_updated_at();
