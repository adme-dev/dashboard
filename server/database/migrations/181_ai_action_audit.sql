-- 181_ai_action_audit.sql
-- Phase-0 WS-C: durable, queryable audit ledger for every executed AI write action.
-- Additive + dormant: written by the confirm/executor path (WS-C.2); read by the Command Center.
-- One spine for staff chat, the virtual office, and the client portal (client_scope-tagged).

CREATE TABLE IF NOT EXISTS ai_action_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_id    UUID REFERENCES ai_pending_actions(id) ON DELETE SET NULL,
  user_id       UUID NOT NULL,              -- proposer
  confirmed_by  UUID,                       -- approver (may differ under future dual-control)
  tool_name     TEXT NOT NULL,
  risk_tier     TEXT NOT NULL DEFAULT 'confirm',   -- auto | confirm | rich_confirm
  client_scope  UUID,                       -- set for portal/tenant-scoped actions; NULL for agency staff
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- the resolved action
  result_ref    TEXT,                       -- created/changed entity id
  rollback_ref  TEXT,                       -- handle to reverse it, if reversible
  outcome       TEXT NOT NULL,              -- executed | failed | rolled_back
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_audit_user  ON ai_action_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_tool  ON ai_action_audit(tool_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_scope ON ai_action_audit(client_scope, created_at DESC) WHERE client_scope IS NOT NULL;
