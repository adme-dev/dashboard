-- 183_ai_agent_configs.sql
-- Phase 3 (command-center spec §4a): self-service co-pilot configuration.
-- The golden rule: configuration NARROWS within the RBAC ceiling — it never GRANTS. tool_overrides
-- is always INTERSECTED with the user's RBAC-permitted tools at run time; this table can only subtract.
-- Additive only.

CREATE TABLE IF NOT EXISTS ai_agent_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'personal',     -- personal | shared
  name            TEXT,
  persona_key     TEXT,                                  -- preferred default skill-pack (resolvePersona)
  tool_overrides  JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { disabled: ["get_x", ...] } — subtract only
  memory_enabled  BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one personal config per user (shared/built configs get their own rows)
  CONSTRAINT ai_agent_configs_personal_uniq UNIQUE (owner_user_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_owner ON ai_agent_configs(owner_user_id);
