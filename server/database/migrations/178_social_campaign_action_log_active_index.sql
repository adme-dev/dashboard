-- 178_social_campaign_action_log_active_index.sql
-- Supports duplicate checks for active AI pacing budget recommendations.

ALTER TABLE campaign_action_log
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE campaign_action_log
SET cancelled_by = COALESCE(cancelled_by, NULLIF(metadata->>'cancelledBy', '')::uuid),
    cancelled_at = COALESCE(cancelled_at, NULLIF(metadata->>'cancelledAt', '')::timestamptz)
WHERE action_status = 'cancelled'
  AND (
    cancelled_by IS NULL
    OR cancelled_at IS NULL
  )
  AND (
    metadata ? 'cancelledBy'
    OR metadata ? 'cancelledAt'
  );

CREATE INDEX IF NOT EXISTS idx_campaign_action_log_active_ai_pacing_budget
  ON campaign_action_log (
    media_spend_id,
    action_type,
    ((new_value->>'dailyBudget')::numeric),
    requested_at DESC
  )
  WHERE metadata->>'source' = 'ai_pacing_review'
    AND action_type = 'budget_update'
    AND action_status IN ('planned', 'approved');

CREATE INDEX IF NOT EXISTS idx_campaign_action_log_media_spend_lifecycle
  ON campaign_action_log (
    media_spend_id,
    COALESCE(executed_at, cancelled_at, approved_at, requested_at) DESC
  );
