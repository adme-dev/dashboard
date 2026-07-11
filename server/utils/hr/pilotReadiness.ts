export interface HrPilotReadinessInput {
  governanceReady: boolean
  completedOnboarding: number
  publishedRoles: number
  eligibleParticipants: number
  organizationallyMappedParticipants: number
  emailConfigured: boolean
  activeCycles: number
  approvedMondayScope?: boolean
}

export type HrPilotBlocker = 'GOVERNANCE_INCOMPLETE' | 'OWNER_ONBOARDING_INCOMPLETE' |
  'NO_PUBLISHED_ROLE' | 'NO_ELIGIBLE_PARTICIPANT' | 'NO_ORGANIZATIONAL_DEPARTMENT' |
  'EMAIL_NOT_CONFIGURED' | 'ACTIVE_CYCLE_EXISTS'

export function evaluateHrPilotReadiness(input: HrPilotReadinessInput) {
  const blockers: HrPilotBlocker[] = []
  if (!input.governanceReady) blockers.push('GOVERNANCE_INCOMPLETE')
  if (input.completedOnboarding < 1) blockers.push('OWNER_ONBOARDING_INCOMPLETE')
  if (input.publishedRoles < 1) blockers.push('NO_PUBLISHED_ROLE')
  if (input.eligibleParticipants < 1) blockers.push('NO_ELIGIBLE_PARTICIPANT')
  if (input.organizationallyMappedParticipants < 1) blockers.push('NO_ORGANIZATIONAL_DEPARTMENT')
  if (!input.emailConfigured) blockers.push('EMAIL_NOT_CONFIGURED')
  if (input.activeCycles > 0) blockers.push('ACTIVE_CYCLE_EXISTS')

  return {
    ready: blockers.length === 0,
    blockers,
    warnings: input.approvedMondayScope === false ? ['MONDAY_SCOPE_NOT_INCLUDED'] : [],
  }
}
