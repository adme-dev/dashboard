-- 047: Saved Action Plans
-- Allows users to pin/save AI-generated action plans from anomalies/insights pages.
-- Pinned plans also surface in AI chat as financial context.

CREATE TABLE IF NOT EXISTS saved_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  tenant_id UUID,

  -- Source context
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('anomaly', 'recommendation', 'insight')),
  source_title TEXT NOT NULL,
  source_description TEXT,
  source_severity VARCHAR(20),
  source_category VARCHAR(100),

  -- The full generated plan (stored as JSON)
  plan_data JSONB NOT NULL,

  -- User notes
  note TEXT,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'resolved', 'dismissed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_action_plans_user
  ON saved_action_plans (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_action_plans_tenant
  ON saved_action_plans (tenant_id, status, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- For AI chat context retrieval
CREATE INDEX IF NOT EXISTS idx_saved_action_plans_active
  ON saved_action_plans (user_id, created_at DESC)
  WHERE status IN ('active', 'in_progress');
