-- Ops Autopilot Phase A.1 — capability-raised escalations (the human-on-call queue).
-- Decoupled from chat (ai_pending_actions) and from task approvals (task_approvals):
-- autonomous capabilities raise these for a human to approve/reject in /agency/automation.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS automation_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capability TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  client_id UUID,
  run_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  proposed_action JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','auto_resolved','expired')),
  assigned_role TEXT NOT NULL DEFAULT 'AUTOMATION',
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_escalations_status ON automation_escalations(status);
CREATE INDEX IF NOT EXISTS idx_automation_escalations_client ON automation_escalations(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_escalations_created ON automation_escalations(created_at);
