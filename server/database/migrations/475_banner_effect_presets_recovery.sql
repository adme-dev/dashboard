CREATE TABLE IF NOT EXISTS banner_effect_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  recipe JSONB NOT NULL,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS banner_effect_presets_client ON banner_effect_presets(client_id) WHERE archived_at IS NULL;
