import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const onboardingGet = readFileSync(
  new URL('../../server/api/agency/hr/onboarding/index.get.ts', import.meta.url),
  'utf8',
)
const onboardingPut = readFileSync(
  new URL('../../server/api/agency/hr/onboarding/index.put.ts', import.meta.url),
  'utf8',
)
const overview = readFileSync(
  new URL('../../server/api/agency/hr/index.get.ts', import.meta.url),
  'utf8',
)

describe('HR API security contract', () => {
  it('keeps owner onboarding owner-only, non-cacheable, validated, and audited', () => {
    for (const route of [onboardingGet, onboardingPut]) {
      expect(route).toContain('requireHrAdmin(event)')
      expect(route).toContain("'Cache-Control', 'private, no-store'")
      expect(route).toContain('recordHrAuditEvent')
    }
    expect(onboardingPut).toContain('hrOwnerOnboardingSchema.safeParse')
    expect(onboardingPut).toContain('WHERE id = $1 AND owner_id = $2')
  })

  it('only returns participant records scoped to the authenticated team member', () => {
    expect(overview).toContain('participant.team_member_id = $1')
    expect(overview).toContain('[user.id]')
    expect(overview).toContain("'Cache-Control', 'private, no-store'")
  })
})
