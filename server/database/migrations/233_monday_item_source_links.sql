-- Formalize the source-state fields used by canonical Monday task alerts.
-- These columns existed in the legacy complete schema but were not represented
-- in the numbered migration chain used by new environments.
ALTER TABLE monday_item_mappings
  ADD COLUMN IF NOT EXISTS monday_board_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- The hourly health scan selects the latest completed mapping for each local
-- task. Keep that lookup bounded as migration history grows.
CREATE INDEX IF NOT EXISTS idx_monday_item_mappings_task_updated_completed
  ON monday_item_mappings (task_id, updated_at DESC)
  WHERE task_id IS NOT NULL AND status = 'completed';

COMMENT ON COLUMN monday_item_mappings.archived IS
  'True when the most recently observed Monday source record is archived or deleted; excluded from active health alerts.';
