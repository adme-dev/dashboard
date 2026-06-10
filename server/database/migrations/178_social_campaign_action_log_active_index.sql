-- 178_social_campaign_action_log_active_index.sql
-- Supports duplicate checks for active AI pacing budget recommendations.

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
