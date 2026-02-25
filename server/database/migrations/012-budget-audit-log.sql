-- Budget audit log — tracks who changed budgets and when
-- Performance-conscious: auto-prune old records, indexed for fast lookups

CREATE TABLE IF NOT EXISTS budget_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  previous_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  new_budget NUMERIC(12,2) NOT NULL,
  changed_by UUID NOT NULL REFERENCES team_members(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

-- Fast lookup by media_spend_id (most common query)
CREATE INDEX IF NOT EXISTS idx_budget_audit_media_spend ON budget_audit_log(media_spend_id, changed_at DESC);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_budget_audit_changed_by ON budget_audit_log(changed_by, changed_at DESC);

-- Auto-prune: keep only last 50 entries per media_spend row
-- This prevents unbounded growth while preserving recent history
CREATE OR REPLACE FUNCTION prune_budget_audit_log() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM budget_audit_log
  WHERE id IN (
    SELECT id FROM budget_audit_log
    WHERE media_spend_id = NEW.media_spend_id
    ORDER BY changed_at DESC
    OFFSET 50
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_budget_audit ON budget_audit_log;
CREATE TRIGGER trg_prune_budget_audit
  AFTER INSERT ON budget_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prune_budget_audit_log();
