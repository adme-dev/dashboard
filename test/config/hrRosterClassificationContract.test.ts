import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/244_hr_roster_classification.sql', 'utf8')
const updateRoute = readFileSync('server/api/agency/hr/organizational-departments/classifications/[memberId].patch.ts', 'utf8')
const readiness = readFileSync('server/api/agency/hr/governance/pilot-readiness.get.ts', 'utf8')
const roleAssignment = readFileSync('server/api/agency/hr/role-assignments/index.post.ts', 'utf8')
const rolesPage = readFileSync('app/pages/agency/hr/roles.vue', 'utf8')

describe('HR roster classification contract', () => {
  it('stores owner-confirmed review eligibility separately from team authentication roles', () => {
    expect(migration).toContain('hr_roster_classifications')
    expect(migration).toContain('review_eligible')
    expect(migration).toContain('team_member_id UUID NOT NULL UNIQUE')
  })

  it('requires HR authorization, validation, and audit for classification changes', () => {
    expect(updateRoute).toContain('requireHrAdmin(event)')
    expect(updateRoute).toContain('hrRosterClassificationSchema.safeParse')
    expect(updateRoute).toContain("action: 'roster.classification_updated'")
  })

  it('allows only confirmed eligible people into role assignment and pilot readiness', () => {
    expect(readiness).toContain('classification.review_eligible = TRUE')
    expect(roleAssignment).toContain('classification.review_eligible = TRUE')
    expect(rolesPage).toContain('member.review_eligible === true')
    expect(rolesPage).toContain('Classify record')
  })
})
