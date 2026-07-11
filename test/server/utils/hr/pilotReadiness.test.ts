import { describe, expect, it } from 'vitest'
import { evaluateHrPilotReadiness } from '../../../../server/utils/hr/pilotReadiness'

describe('HR controlled pilot readiness', () => {
  it('is ready only with governance, onboarding, role-linked participant, and delivery', () => {
    expect(evaluateHrPilotReadiness({ governanceReady: true, completedOnboarding: 1, publishedRoles: 1, eligibleParticipants: 1, organizationallyMappedParticipants: 1, emailConfigured: true, activeCycles: 0 }))
      .toEqual({ ready: true, blockers: [], warnings: [] })
  })

  it('reports every launch blocker without creating records', () => {
    const result = evaluateHrPilotReadiness({ governanceReady: false, completedOnboarding: 0, publishedRoles: 0, eligibleParticipants: 0, organizationallyMappedParticipants: 0, emailConfigured: false, activeCycles: 1 })
    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'GOVERNANCE_INCOMPLETE', 'OWNER_ONBOARDING_INCOMPLETE', 'NO_PUBLISHED_ROLE',
      'NO_ELIGIBLE_PARTICIPANT', 'NO_ORGANIZATIONAL_DEPARTMENT', 'EMAIL_NOT_CONFIGURED', 'ACTIVE_CYCLE_EXISTS'
    ]))
  })

  it('warns when evidence connectors are intentionally absent but does not require them', () => {
    const result = evaluateHrPilotReadiness({ governanceReady: true, completedOnboarding: 1, publishedRoles: 1, eligibleParticipants: 1, organizationallyMappedParticipants: 1, emailConfigured: true, activeCycles: 0, approvedMondayScope: false })
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain('MONDAY_SCOPE_NOT_INCLUDED')
  })

  it('blocks a role-linked participant who is not mapped to a governed organizational department', () => {
    const result = evaluateHrPilotReadiness({ governanceReady: true, completedOnboarding: 1, publishedRoles: 1, eligibleParticipants: 1, organizationallyMappedParticipants: 0, emailConfigured: true, activeCycles: 0 })
    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(['NO_ORGANIZATIONAL_DEPARTMENT'])
  })
})
