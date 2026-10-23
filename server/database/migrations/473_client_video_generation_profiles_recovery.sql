-- Explicit production video budgets and reusable client campaign guidance.
CREATE TABLE IF NOT EXISTS client_video_generation_profiles (
  client_id UUID PRIMARY KEY REFERENCES agency_clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  monthly_cap_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cap_cents BETWEEN 0 AND 100000),
  allowed_model_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_model_ids) = 'array'),
  brand_name TEXT NOT NULL DEFAULT '',
  brand_website TEXT NOT NULL DEFAULT '',
  style_guide TEXT NOT NULL DEFAULT '',
  template_prompt TEXT NOT NULL DEFAULT '',
  social_brief TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
