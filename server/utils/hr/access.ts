export interface HrAccessUser {
  id: string
  role: string
  permissionGroups?: readonly string[]
}

export interface HrParticipantScope {
  participantUserId: string
  reviewerIds?: readonly string[]
}

export type HrParticipantAction = 'read' | 'edit-own-response' | 'score'

export function canManageHr(user: HrAccessUser): boolean {
  return user.role === 'owner' || user.permissionGroups?.includes('HR_ADMIN') === true
}

export function canViewOwnerOnboarding(user: HrAccessUser): boolean {
  return canManageHr(user)
}

export function canAccessHrParticipant(
  user: HrAccessUser,
  scope: HrParticipantScope,
  action: HrParticipantAction,
): boolean {
  if (canManageHr(user)) return true
  if (user.id === scope.participantUserId) return action !== 'score'
  if (action === 'edit-own-response') return false
  return scope.reviewerIds?.includes(user.id) === true
}
