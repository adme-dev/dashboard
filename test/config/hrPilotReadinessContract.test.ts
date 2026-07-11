import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const route = readFileSync('server/api/agency/hr/governance/pilot-readiness.get.ts', 'utf8')

describe('HR pilot readiness API contract', () => {
  it('is private, owner-only and read-only', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain("'Cache-Control', 'private, no-store'")
    expect(route).not.toMatch(/INSERT INTO|UPDATE hr_|DELETE FROM/)
  })

  it('derives readiness from current production facts', () => {
    for (const evidence of ['hr_launch_gate_attestations', 'hr_owner_onboarding_sessions', 'hr_role_profile_versions', 'hr_role_assignments', 'hr_review_cycles']) {
      expect(route).toContain(evidence)
    }
    expect(route).toContain('evaluateHrPilotReadiness')
    expect(route).toContain("department.department_kind = 'organizational'")
    expect(route).toContain('organizationallyMappedParticipants')
  })
})
