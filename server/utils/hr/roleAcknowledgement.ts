export type HrRoleAcknowledgementStatus = 'pending' | 'acknowledged' | 'disputed'

export type HrRoleAcknowledgementDecision = 'apply' | 'unchanged' | 'reject'

/**
 * Role-baseline responses are append-only decisions. Repeating the same
 * response is idempotent, but changing it requires a newly versioned role
 * assignment so the original acknowledgement remains reproducible.
 */
export function decideRoleAcknowledgement(
  current: HrRoleAcknowledgementStatus,
  requested: Exclude<HrRoleAcknowledgementStatus, 'pending'>,
): HrRoleAcknowledgementDecision {
  if (current === 'pending') return 'apply'
  if (current === requested) return 'unchanged'
  return 'reject'
}
