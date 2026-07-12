import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'server/database/migrations/246_hr_frozen_scorecard_assignments.sql',
  'utf8',
)
const assign = readFileSync(
  'server/api/agency/hr/role-assignments/index.post.ts',
  'utf8',
)
const commission = readFileSync(
  'server/api/agency/hr/reviews/index.post.ts',
  'utf8',
)
const scorecardGet = readFileSync(
  'server/api/agency/hr/reviews/participants/[id]/scorecard.get.ts',
  'utf8',
)
const scorecardPut = readFileSync(
  'server/api/agency/hr/reviews/participants/[id]/scorecard.put.ts',
  'utf8',
)
const assignment = readFileSync(
  'server/api/agency/hr/assignments/[id]/index.get.ts',
  'utf8',
)
const page = readFileSync('app/pages/agency/hr/assignments/[id].vue', 'utf8')
const preReview = readFileSync(
  'server/api/agency/hr/role-assignments/[id]/acknowledgement.patch.ts',
  'utf8',
)
const preReviewPage = readFileSync(
  'app/pages/agency/hr/my-role/[id].vue',
  'utf8',
)
const preview = readFileSync(
  'server/api/agency/hr/reviews/preview.post.ts',
  'utf8',
)
const reviewsPage = readFileSync('app/pages/agency/hr/reviews.vue', 'utf8')
const notifications = readFileSync('server/utils/notifications.ts', 'utf8')

describe('frozen role scorecard assignment', () => {
  it('pins a published scorecard version to role assignments and review participants', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS scorecard_version_id')
    expect(assign).toContain('scorecard_version_id')
    expect(commission).toContain('assignment.scorecard_version_id')
    expect(commission).toContain('scorecard_version_id)')
  })

  it('requires acknowledgement before commissioning and never follows a newer scorecard', () => {
    expect(commission).toContain(
      "assignment.acknowledgement_status = 'acknowledged'",
    )
    expect(preview).toContain(
      "assignment.acknowledgement_status = 'acknowledged'",
    )
    expect(reviewsPage).toContain("acknowledgement_status !== 'acknowledged'")
    expect(scorecardGet).toContain(
      'scorecard.id = participant.scorecard_version_id',
    )
    expect(scorecardPut).toContain(
      'scorecard.id = participant.scorecard_version_id',
    )
    expect(scorecardGet).not.toContain(
      'FROM hr_role_scorecard_versions candidate',
    )
  })

  it('shows the full criteria before acknowledgement and excludes questionnaire opinion', () => {
    expect(assignment).toContain('scorecard.criteria AS scorecard_criteria')
    expect(page).toContain('Published role scorecard')
    expect(page).toContain('Questionnaire answers do not supply')
    expect(page).toContain('KPI results or objective evidence')
    expect(preReview).toContain(
      'Only the assigned person can acknowledge this role and scorecard baseline',
    )
    expect(preReviewPage).toContain('Acknowledge role and scorecard')
    expect(assign).toContain("type: 'hr_role_assigned'")
    expect(notifications).toContain("| 'hr_role_assigned'")
  })
})
