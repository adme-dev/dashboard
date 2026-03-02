-- 035: Add rolling budget support to media_spend
-- When budget_rolling = true, the budget carries forward to subsequent months
-- until manually changed.

ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS budget_rolling BOOLEAN NOT NULL DEFAULT false;
