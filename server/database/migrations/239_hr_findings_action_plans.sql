-- Evidence-linked findings, participant right of response, dual approval for
-- adverse individual findings, and balanced action-plan responsibilities.
CREATE TABLE IF NOT EXISTS hr_review_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'role_clarity', 'workload', 'process', 'dependency', 'capability', 'tool_access',
    'quality', 'timeliness', 'attendance_reliability', 'management_system',
    'positive_contribution', 'no_finding'
  )),
  accountability_class TEXT NOT NULL CHECK (accountability_class IN ('employee', 'business', 'shared', 'unclear')),
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  contrary_evidence_review TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  adverse_individual BOOLEAN NOT NULL DEFAULT FALSE,
  participant_response_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (participant_response_status IN ('pending', 'received', 'declined', 'not_required')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'participant_review', 'awaiting_second_approval', 'published', 'rejected', 'superseded')),
  no_action_rationale TEXT,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  second_approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  second_approved_at TIMESTAMPTZ,
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT adverse_individual OR accountability_class IN ('employee', 'shared')),
  CHECK (status <> 'published' OR participant_response_status <> 'pending'),
  CHECK (status <> 'published' OR NOT adverse_individual OR second_approved_by IS NOT NULL),
  CHECK (status <> 'published' OR published_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_findings_participant_status
  ON hr_review_findings(participant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_finding_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL UNIQUE REFERENCES hr_review_findings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  response TEXT,
  correction_requested BOOLEAN NOT NULL DEFAULT FALSE,
  correction_detail TEXT,
  response_status TEXT NOT NULL CHECK (response_status IN ('received', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (response_status = 'declined' OR length(btrim(response)) >= 3),
  CHECK (NOT correction_requested OR length(btrim(correction_detail)) >= 10)
);

ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS finding_id UUID REFERENCES hr_review_findings(id) ON DELETE SET NULL;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS employee_responsibility TEXT;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS business_responsibility TEXT;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS support_commitment TEXT;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS success_measure TEXT;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS review_at TIMESTAMPTZ;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS closure_note TEXT;
ALTER TABLE hr_follow_up_plans ADD COLUMN IF NOT EXISTS closure_acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hr_follow_up_finding ON hr_follow_up_plans(finding_id) WHERE finding_id IS NOT NULL;

COMMENT ON TABLE hr_review_findings IS
  'Human-authored, evidence-linked review findings. No finding or remedy is generated or imposed automatically.';
COMMENT ON TABLE hr_finding_responses IS
  'Participant statement, correction request, or explicit decline recorded before publication.';
