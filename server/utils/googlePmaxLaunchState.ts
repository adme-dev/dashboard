export const GOOGLE_PMAX_LAUNCH_STATES = [
  'DRAFT',
  'PREFLIGHT_FAILED',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'CREATED_PAUSED',
  'VERIFICATION_FAILED',
  'VERIFIED_PAUSED',
  'ACTIVATION_APPROVED',
  'ENABLING',
  'ENABLED_VERIFIED',
  'FAILED_RETRYABLE',
  'RECOVERY_REQUIRED',
  'CANCELLED'
] as const

export type GooglePmaxLaunchState = typeof GOOGLE_PMAX_LAUNCH_STATES[number]

export interface GooglePmaxLaunchTransitionInput {
  from: GooglePmaxLaunchState
  to: GooglePmaxLaunchState
  currentConfigVersion: number
  expectedConfigVersion: number
  currentConfigHash: string
  expectedConfigHash: string
  authorization?: 'create_approval' | 'activation_approval'
  retryFromState?: 'EXECUTING' | 'ENABLING' | null
}

export type GooglePmaxLaunchTransitionResult
  = | { ok: true, value: { from: GooglePmaxLaunchState, to: GooglePmaxLaunchState } }
    | { ok: false, code: 'LAUNCH_CONFIG_IDENTITY_INVALID' | 'LAUNCH_CONFIG_STALE' | 'LAUNCH_STATE_TRANSITION_INVALID' | 'LAUNCH_APPROVAL_EVIDENCE_REQUIRED' | 'LAUNCH_RETRY_PHASE_MISMATCH', message: string }

const ALLOWED_TRANSITIONS: Readonly<Record<GooglePmaxLaunchState, readonly GooglePmaxLaunchState[]>> = {
  DRAFT: ['PREFLIGHT_FAILED', 'READY_FOR_APPROVAL', 'CANCELLED'],
  PREFLIGHT_FAILED: ['DRAFT', 'READY_FOR_APPROVAL', 'CANCELLED'],
  READY_FOR_APPROVAL: ['DRAFT', 'PREFLIGHT_FAILED', 'APPROVED', 'CANCELLED'],
  APPROVED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['CREATED_PAUSED', 'FAILED_RETRYABLE', 'RECOVERY_REQUIRED'],
  CREATED_PAUSED: ['VERIFICATION_FAILED', 'VERIFIED_PAUSED', 'RECOVERY_REQUIRED'],
  VERIFICATION_FAILED: ['VERIFIED_PAUSED', 'RECOVERY_REQUIRED'],
  VERIFIED_PAUSED: ['ACTIVATION_APPROVED'],
  ACTIVATION_APPROVED: ['ENABLING'],
  ENABLING: ['ENABLED_VERIFIED', 'FAILED_RETRYABLE', 'RECOVERY_REQUIRED'],
  ENABLED_VERIFIED: [],
  FAILED_RETRYABLE: ['EXECUTING', 'ENABLING', 'RECOVERY_REQUIRED'],
  RECOVERY_REQUIRED: [],
  CANCELLED: []
}

const HASH_PATTERN = /^[a-f0-9]{64}$/

export function evaluateGooglePmaxLaunchTransition(
  input: GooglePmaxLaunchTransitionInput
): GooglePmaxLaunchTransitionResult {
  const validStates = new Set<string>(GOOGLE_PMAX_LAUNCH_STATES)
  if (!validStates.has(input.from) || !validStates.has(input.to)) {
    return {
      ok: false,
      code: 'LAUNCH_STATE_TRANSITION_INVALID',
      message: 'Launch transition contains an unknown state.'
    }
  }

  if (
    !Number.isInteger(input.currentConfigVersion)
    || input.currentConfigVersion <= 0
    || !Number.isInteger(input.expectedConfigVersion)
    || input.expectedConfigVersion <= 0
    || !HASH_PATTERN.test(input.currentConfigHash)
    || !HASH_PATTERN.test(input.expectedConfigHash)
  ) {
    return {
      ok: false,
      code: 'LAUNCH_CONFIG_IDENTITY_INVALID',
      message: 'Launch transitions require a positive config version and canonical SHA-256 hash.'
    }
  }

  if (
    input.currentConfigVersion !== input.expectedConfigVersion
    || input.currentConfigHash !== input.expectedConfigHash
  ) {
    return {
      ok: false,
      code: 'LAUNCH_CONFIG_STALE',
      message: 'The launch configuration changed; refresh and review the current version.'
    }
  }

  if (!ALLOWED_TRANSITIONS[input.from]?.includes(input.to)) {
    return {
      ok: false,
      code: 'LAUNCH_STATE_TRANSITION_INVALID',
      message: `Launch cannot transition from ${input.from} to ${input.to}.`
    }
  }

  if (
    (input.to === 'APPROVED' && input.authorization !== 'create_approval')
    || (input.to === 'ACTIVATION_APPROVED' && input.authorization !== 'activation_approval')
  ) {
    return {
      ok: false,
      code: 'LAUNCH_APPROVAL_EVIDENCE_REQUIRED',
      message: 'Approval state requires an atomic version-bound approval record.'
    }
  }

  if (
    input.from === 'FAILED_RETRYABLE'
    && (input.to === 'EXECUTING' || input.to === 'ENABLING')
    && input.retryFromState !== input.to
  ) {
    return {
      ok: false,
      code: 'LAUNCH_RETRY_PHASE_MISMATCH',
      message: 'Retry must resume the execution phase that failed.'
    }
  }

  return { ok: true, value: { from: input.from, to: input.to } }
}
