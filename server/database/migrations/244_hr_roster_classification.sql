-- Owner-confirmed HR roster eligibility. Authentication roles and account activity
-- are not evidence that an identity is a person or eligible for an HR review.
CREATE TABLE IF NOT EXISTS hr_roster_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL UNIQUE REFERENCES team_members(id) ON DELETE CASCADE,
  classification TEXT NOT NULL CHECK (classification IN (
    'person', 'shared_account', 'service_account', 'test_account', 'external_contact'
  )),
  person_type TEXT CHECK (person_type IS NULL OR person_type IN ('employee', 'contractor', 'other')),
  review_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  confirmed_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (review_eligible = FALSE OR classification = 'person'),
  CHECK (classification <> 'person' OR person_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_roster_classifications_eligibility
  ON hr_roster_classifications (review_eligible, classification);

COMMENT ON TABLE hr_roster_classifications IS
  'Human-confirmed identity classification and HR review eligibility; automated suggestions never write this table.';
