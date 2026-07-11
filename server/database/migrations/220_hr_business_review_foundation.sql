-- HR Business Review foundation
-- Private, versioned records for owner discovery, role clarity, neutral reviews,
-- evidence-aware scoring, and append-only access/change auditing.

CREATE TABLE IF NOT EXISTS hr_owner_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'archived')),
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 8),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  consented_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_owner_onboarding_owner
  ON hr_owner_onboarding_sessions(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_business_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_session_id UUID NOT NULL
    REFERENCES hr_owner_onboarding_sessions(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (onboarding_session_id, version)
);

CREATE TABLE IF NOT EXISTS hr_role_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_role_profile_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_profile_id UUID NOT NULL REFERENCES hr_role_profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  purpose TEXT NOT NULL,
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_authority JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  out_of_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  benchmark_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_profile_id, version)
);

CREATE TABLE IF NOT EXISTS hr_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role_profile_version_id UUID NOT NULL
    REFERENCES hr_role_profile_versions(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  acknowledgement_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (acknowledgement_status IN ('pending', 'acknowledged', 'disputed')),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_role_assignment_active
  ON hr_role_assignments(team_member_id)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS hr_review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'business_review'
    CHECK (purpose IN ('business_review', 'probation', 'annual_review', 'role_clarity', 'pulse')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'open', 'closed', 'archived')),
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  opens_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  business_context_version_id UUID
    REFERENCES hr_business_context_versions(id) ON DELETE SET NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at > opens_at),
  CHECK (closes_at >= due_at)
);

CREATE TABLE IF NOT EXISTS hr_review_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES hr_review_cycles(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  role_profile_version_id UUID
    REFERENCES hr_role_profile_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'submitted', 'reviewed', 'closed', 'overdue')),
  extension_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS hr_questionnaire_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  purpose TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'participant_and_hr'
    CHECK (visibility IN ('participant_and_hr', 'hr_only', 'participant_reviewer_and_hr')),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'retired')),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_key, version)
);

CREATE TABLE IF NOT EXISTS hr_questionnaire_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL UNIQUE
    REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  questionnaire_version_id UUID NOT NULL
    REFERENCES hr_questionnaire_versions(id) ON DELETE RESTRICT,
  opens_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  extension_due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'open', 'in_progress', 'submitted', 'overdue', 'closed')),
  calendar_uid TEXT,
  calendar_sequence INTEGER NOT NULL DEFAULT 0 CHECK (calendar_sequence >= 0),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at > opens_at),
  CHECK (extension_due_at IS NULL OR extension_due_at > due_at)
);

CREATE TABLE IF NOT EXISTS hr_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL
    REFERENCES hr_questionnaire_assignments(id) ON DELETE CASCADE,
  respondent_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'locked')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, respondent_id)
);

CREATE TABLE IF NOT EXISTS hr_benchmark_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_key TEXT NOT NULL,
  name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  version TEXT NOT NULL,
  source_url TEXT,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'retired')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (framework_key, version)
);

INSERT INTO hr_benchmark_frameworks
  (framework_key, name, publisher, version, source_url, criteria, status, reviewed_at)
VALUES
  ('ami-mcf', 'Marketers Competency Framework', 'Australian Marketing Institute', 'current-2026-07-10',
   'https://ami.org.au/training/marketers-competency-framework/',
   '[{"dimension":"technical marketing capability"},{"dimension":"business capability"},{"dimension":"professional capability"}]'::jsonb,
   'active', NOW()),
  ('sfia-9', 'Skills Framework for the Information Age', 'SFIA Foundation', '9',
   'https://sfia-online.org/en/about-sfia/how-sfia-works',
   '[{"dimension":"professional skill"},{"dimension":"responsibility level"},{"dimension":"generic attribute"}]'::jsonb,
   'active', NOW()),
  ('pmi-pmcd', 'Project Manager Competency Development Framework', 'Project Management Institute', 'third-edition',
   'https://www.pmi.org/standards/pm-competency-development-third-edition',
   '[{"dimension":"knowledge"},{"dimension":"performance"},{"dimension":"personal competence"}]'::jsonb,
   'active', NOW())
ON CONFLICT (framework_key, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_role_scorecard_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_profile_version_id UUID NOT NULL
    REFERENCES hr_role_profile_versions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_threshold NUMERIC(5,2) NOT NULL DEFAULT 70
    CHECK (evidence_threshold BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_profile_version_id, version)
);

CREATE TABLE IF NOT EXISTS hr_scorecard_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  scorecard_version_id UUID NOT NULL
    REFERENCES hr_role_scorecard_versions(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  role_score NUMERIC(4,2) CHECK (role_score BETWEEN 1 AND 5),
  operational_enablement NUMERIC(4,2)
    CHECK (operational_enablement BETWEEN 1 AND 5),
  evidence_coverage NUMERIC(5,2) NOT NULL
    CHECK (evidence_coverage BETWEEN 0 AND 100),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  publishable BOOLEAN NOT NULL DEFAULT FALSE,
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, scorecard_version_id, version)
);

CREATE TABLE IF NOT EXISTS hr_operational_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (participant_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS hr_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL
    REFERENCES hr_questionnaire_assignments(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'calendar')),
  kind TEXT NOT NULL CHECK (kind IN ('assignment', 'reminder', 'overdue', 'extension', 'interview')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  provider_reference TEXT,
  error_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  cycle_id UUID REFERENCES hr_review_cycles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_target
  ON hr_audit_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_cycle
  ON hr_audit_events(cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_review_participant_member
  ON hr_review_participants(team_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_assignment_due
  ON hr_questionnaire_assignments(status, due_at);

COMMENT ON TABLE hr_owner_onboarding_sessions IS
  'Private owner discovery answers; never exposed through participant review routes.';
COMMENT ON TABLE hr_responses IS
  'Private structured questionnaire responses. Application authorization is deny-by-default.';
COMMENT ON TABLE hr_audit_events IS
  'Append-only audit trail for access, publication, assignment, submission, and scoring events.';
