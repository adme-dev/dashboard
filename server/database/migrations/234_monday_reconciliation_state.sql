-- Durable source-state and drift markers for Monday mappings. Webhook changes
-- never delete or rewrite local tasks; they mark the latest source mapping until
-- the governed reconciliation fetch observes the exact Monday item timestamp.
ALTER TABLE monday_item_mappings
  ADD COLUMN IF NOT EXISTS source_state VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (source_state IN ('active', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'current'
    CHECK (reconciliation_status IN ('current', 'pending', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event_id VARCHAR(160);

-- Preserve legacy archive observations without overriding any state already
-- written by the new processor on a safe migration re-run.
UPDATE monday_item_mappings
   SET source_state = 'archived', reconciliation_status = 'archived'
 WHERE archived = true
   AND source_state = 'active'
   AND reconciliation_status = 'current';

CREATE INDEX IF NOT EXISTS idx_monday_item_mappings_reconciliation
  ON monday_item_mappings (monday_board_id, reconciliation_status, source_updated_at DESC)
  WHERE task_id IS NOT NULL AND status = 'completed';

COMMENT ON COLUMN monday_item_mappings.reconciliation_status IS
  'current after a successful source fetch; pending after a structured webhook; archived/deleted for terminal Monday source state. Local tasks are retained.';
