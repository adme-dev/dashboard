CREATE TABLE IF NOT EXISTS hr_review_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  location TEXT,
  agenda TEXT NOT NULL,
  participant_summary TEXT,
  private_notes TEXT,
  calendar_uid TEXT NOT NULL,
  calendar_sequence INTEGER NOT NULL DEFAULT 0 CHECK (calendar_sequence >= 0),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_hr_review_interviews_participant
  ON hr_review_interviews(participant_id, starts_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_review_interviews_one_scheduled
  ON hr_review_interviews(participant_id) WHERE status = 'scheduled';

COMMENT ON COLUMN hr_review_interviews.private_notes IS
  'Restricted to the assigned reviewer and HR owners; never returned to the participant.';
COMMENT ON COLUMN hr_review_interviews.participant_summary IS
  'Factual summary visible to the participant after the interview is completed.';
