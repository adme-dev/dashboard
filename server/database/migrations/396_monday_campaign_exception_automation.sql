-- Idempotent claims and rollback evidence for the Campaign Exceptions board.

CREATE TABLE IF NOT EXISTS monday_campaign_exception_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_item_id TEXT NOT NULL,
  monday_item_updated_at TIMESTAMPTZ NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('apply', 'rollback')),
  campaign_action_id UUID REFERENCES campaign_action_log(id) ON DELETE SET NULL,
  media_spend_id UUID REFERENCES media_spend(id) ON DELETE SET NULL,
  previous_daily_budget NUMERIC(14,2),
  applied_daily_budget NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'applied', 'failed', 'rolled_back')),
  failure_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (monday_item_id, monday_item_updated_at, operation)
);

CREATE INDEX IF NOT EXISTS idx_monday_campaign_exception_actions_item
  ON monday_campaign_exception_actions (monday_item_id, created_at DESC);
