import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/220_hr_business_review_foundation.sql', import.meta.url),
  'utf8',
)

describe('HR business review migration', () => {
  it('creates the private onboarding, role, review, questionnaire, score, and audit spine', () => {
    for (const table of [
      'hr_owner_onboarding_sessions',
      'hr_business_context_versions',
      'hr_role_profile_versions',
      'hr_review_cycles',
      'hr_review_participants',
      'hr_questionnaire_versions',
      'hr_questionnaire_assignments',
      'hr_responses',
      'hr_benchmark_frameworks',
      'hr_role_scorecard_versions',
      'hr_scorecard_results',
      'hr_operational_profiles',
      'hr_audit_events',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('enforces unique versions, review dates, response ownership, and append-oriented audit indexes', () => {
    expect(migration).toContain('UNIQUE (role_profile_id, version)')
    expect(migration).toContain('CHECK (due_at > opens_at)')
    expect(migration).toContain('CHECK (closes_at >= due_at)')
    expect(migration).toContain('UNIQUE (assignment_id, respondent_id)')
    expect(migration).toContain('idx_hr_audit_target')
  })
})
