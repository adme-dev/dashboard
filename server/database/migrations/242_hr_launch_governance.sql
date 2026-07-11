-- Human-owned production launch gates for the HR review workflow. Approvals are
-- append-only; the latest row for each gate determines readiness.
CREATE TABLE IF NOT EXISTS hr_launch_gate_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_key TEXT NOT NULL CHECK (gate_key IN (
    'privacy_impact_assessment', 'staff_notice_and_consultation',
    'source_scope_review', 'accessibility_review', 'scoring_calibration',
    'ai_safety_review', 'human_decision_only', 'no_hidden_monitoring',
    'pilot_approval'
  )),
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'pending')),
  evidence_reference TEXT NOT NULL CHECK (char_length(evidence_reference) BETWEEN 10 AND 2000),
  limitations TEXT,
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'approved' AND approved_at IS NOT NULL) OR status <> 'approved'),
  CHECK (expires_at IS NULL OR expires_at > approved_at)
);

CREATE INDEX IF NOT EXISTS idx_hr_launch_gate_latest
  ON hr_launch_gate_attestations (gate_key, created_at DESC);

COMMENT ON TABLE hr_launch_gate_attestations IS
  'Append-only human attestations used to fail closed before live HR questionnaire commissioning.';
