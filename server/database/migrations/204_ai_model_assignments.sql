-- Editable AI model assignment overrides for the Model Ops admin console.
-- The code registry remains the default source of truth; this table records admin-approved overrides.

CREATE TABLE IF NOT EXISTS ai_model_assignments (
  feature_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  fallback_model_id TEXT,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_assignments_updated_at
  ON ai_model_assignments (updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_model_assignment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert', 'reset')),
  previous_value JSONB,
  next_value JSONB,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_assignment_audit_feature_created
  ON ai_model_assignment_audit (feature_key, created_at DESC);
