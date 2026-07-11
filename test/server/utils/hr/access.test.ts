import { describe, expect, it } from 'vitest'
import {
  canAccessHrParticipant,
  canManageHr,
  canViewOwnerOnboarding,
} from '~~/server/utils/hr/access'

describe('HR access policy', () => {
  it('limits owner onboarding to owners and explicitly granted HR administrators', () => {
    expect(canViewOwnerOnboarding({ id: 'owner-1', role: 'owner' })).toBe(true)
    expect(canViewOwnerOnboarding({ id: 'admin-1', role: 'admin' })).toBe(false)
    expect(canViewOwnerOnboarding({ id: 'hr-1', role: 'member', permissionGroups: ['HR_ADMIN'] })).toBe(true)
  })

  it('does not grant HR management through the broad ADMIN or MANAGEMENT groups', () => {
    expect(canManageHr({ id: 'admin-1', role: 'admin', permissionGroups: ['ADMIN'] })).toBe(false)
    expect(canManageHr({ id: 'manager-1', role: 'project_manager', permissionGroups: ['MANAGEMENT'] })).toBe(false)
  })

  it('allows participants to read their own review and assigned reviewers to read only assigned reviews', () => {
    const scope = {
      participantUserId: 'member-1',
      reviewerIds: ['reviewer-1'],
    }

    expect(canAccessHrParticipant({ id: 'member-1', role: 'member' }, scope, 'read')).toBe(true)
    expect(canAccessHrParticipant({ id: 'reviewer-1', role: 'member' }, scope, 'read')).toBe(true)
    expect(canAccessHrParticipant({ id: 'other-1', role: 'member' }, scope, 'read')).toBe(false)
    expect(canAccessHrParticipant({ id: 'reviewer-1', role: 'member' }, scope, 'edit-own-response')).toBe(false)
    expect(canAccessHrParticipant({ id: 'member-1', role: 'member' }, scope, 'score')).toBe(false)
    expect(canAccessHrParticipant({ id: 'reviewer-1', role: 'member' }, scope, 'score')).toBe(true)
  })
})
