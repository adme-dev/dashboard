-- Freeze the exact published role scorecard before acknowledgement and carry
-- that immutable version into any later review participant record.
ALTER TABLE hr_role_assignments
  ADD COLUMN IF NOT EXISTS scorecard_version_id UUID
    REFERENCES hr_role_scorecard_versions(id) ON DELETE RESTRICT;

ALTER TABLE hr_review_participants
  ADD COLUMN IF NOT EXISTS scorecard_version_id UUID
    REFERENCES hr_role_scorecard_versions(id) ON DELETE RESTRICT;

UPDATE hr_role_assignments assignment
   SET scorecard_version_id = (
    SELECT candidate.id
      FROM hr_role_scorecard_versions candidate
     WHERE candidate.role_profile_version_id = assignment.role_profile_version_id
       AND candidate.status = 'published'
     ORDER BY candidate.version DESC LIMIT 1
  )
 WHERE assignment.scorecard_version_id IS NULL;

UPDATE hr_review_participants participant
   SET scorecard_version_id = COALESCE(
    (SELECT assignment.scorecard_version_id
       FROM hr_role_assignments assignment
      WHERE assignment.team_member_id = participant.team_member_id
        AND assignment.role_profile_version_id = participant.role_profile_version_id
      ORDER BY assignment.created_at DESC LIMIT 1),
    (
    SELECT candidate.id
      FROM hr_role_scorecard_versions candidate
     WHERE candidate.role_profile_version_id = participant.role_profile_version_id
       AND candidate.status = 'published'
     ORDER BY candidate.version DESC LIMIT 1
    )
  )
 WHERE participant.scorecard_version_id IS NULL
   AND participant.role_profile_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_role_assignment_scorecard
  ON hr_role_assignments (scorecard_version_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_participant_scorecard
  ON hr_review_participants (scorecard_version_id);

COMMENT ON COLUMN hr_role_assignments.scorecard_version_id IS
  'Exact published scorecard shown with the role baseline before acknowledgement.';
COMMENT ON COLUMN hr_review_participants.scorecard_version_id IS
  'Immutable scorecard snapshot selected at review commissioning; later versions apply only to future reviews.';
