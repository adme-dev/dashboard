import { describe, expect, it } from 'vitest'
import {
  evaluateGooglePmaxLaunchTransition,
  type GooglePmaxLaunchState
} from '~~/server/utils/googlePmaxLaunchState'

const hash = 'a'.repeat(64)

function transition(from: GooglePmaxLaunchState, to: GooglePmaxLaunchState, overrides: Record<string, unknown> = {}) {
  return evaluateGooglePmaxLaunchTransition({
    from,
    to,
    currentConfigVersion: 3,
    expectedConfigVersion: 3,
    currentConfigHash: hash,
    expectedConfigHash: hash,
    ...overrides
  })
}

describe('Google PMax launch state transitions', () => {
  it.each([
    ['DRAFT', 'PREFLIGHT_FAILED', undefined],
    ['DRAFT', 'READY_FOR_APPROVAL', undefined],
    ['READY_FOR_APPROVAL', 'APPROVED', 'create_approval'],
    ['APPROVED', 'EXECUTING', undefined],
    ['EXECUTING', 'CREATED_PAUSED', undefined],
    ['CREATED_PAUSED', 'VERIFIED_PAUSED', undefined],
    ['VERIFIED_PAUSED', 'ACTIVATION_APPROVED', 'activation_approval'],
    ['ACTIVATION_APPROVED', 'ENABLING', undefined],
    ['ENABLING', 'ENABLED_VERIFIED', undefined]
  ] as const)('allows %s -> %s with required evidence', (from, to, authorization) => {
    expect(transition(from, to, { authorization })).toEqual({ ok: true, value: { from, to } })
  })

  it.each([
    ['READY_FOR_APPROVAL', 'APPROVED'],
    ['VERIFIED_PAUSED', 'ACTIVATION_APPROVED']
  ] satisfies Array<[GooglePmaxLaunchState, GooglePmaxLaunchState]>)('rejects approval edge %s -> %s without durable approval evidence', (from, to) => {
    expect(transition(from, to)).toMatchObject({
      ok: false,
      code: 'LAUNCH_APPROVAL_EVIDENCE_REQUIRED'
    })
  })

  it.each([
    ['DRAFT', 'EXECUTING'],
    ['READY_FOR_APPROVAL', 'ENABLING'],
    ['APPROVED', 'ENABLED_VERIFIED'],
    ['CREATED_PAUSED', 'ENABLED_VERIFIED'],
    ['ENABLED_VERIFIED', 'DRAFT'],
    ['CANCELLED', 'DRAFT']
  ] satisfies Array<[GooglePmaxLaunchState, GooglePmaxLaunchState]>)('fails closed for invalid %s -> %s', (from, to) => {
    expect(transition(from, to)).toMatchObject({
      ok: false,
      code: 'LAUNCH_STATE_TRANSITION_INVALID'
    })
  })

  it('rejects a transition for a stale configuration version', () => {
    expect(transition('READY_FOR_APPROVAL', 'APPROVED', {
      expectedConfigVersion: 2
    })).toMatchObject({
      ok: false,
      code: 'LAUNCH_CONFIG_STALE'
    })
  })

  it('rejects a transition for a stale configuration hash', () => {
    expect(transition('APPROVED', 'EXECUTING', {
      expectedConfigHash: 'b'.repeat(64)
    })).toMatchObject({
      ok: false,
      code: 'LAUNCH_CONFIG_STALE'
    })
  })

  it('rejects malformed configuration identity even when both sides match', () => {
    expect(transition('DRAFT', 'READY_FOR_APPROVAL', {
      currentConfigVersion: 0,
      expectedConfigVersion: 0,
      currentConfigHash: 'not-a-hash',
      expectedConfigHash: 'not-a-hash'
    })).toMatchObject({
      ok: false,
      code: 'LAUNCH_CONFIG_IDENTITY_INVALID'
    })
  })

  it.each([
    'DRAFT',
    'PREFLIGHT_FAILED',
    'READY_FOR_APPROVAL',
    'APPROVED'
  ] satisfies GooglePmaxLaunchState[])('allows pre-execution %s -> CANCELLED', (from) => {
    expect(transition(from, 'CANCELLED')).toEqual({
      ok: true,
      value: { from, to: 'CANCELLED' }
    })
  })

  it.each([
    ['EXECUTING', 'FAILED_RETRYABLE'],
    ['EXECUTING', 'RECOVERY_REQUIRED'],
    ['ENABLING', 'FAILED_RETRYABLE'],
    ['ENABLING', 'RECOVERY_REQUIRED']
  ] satisfies Array<[GooglePmaxLaunchState, GooglePmaxLaunchState]>)('records failure path %s -> %s', (from, to) => {
    expect(transition(from, to)).toEqual({ ok: true, value: { from, to } })
  })

  it('allows a retry only into the persisted failure phase', () => {
    expect(transition('FAILED_RETRYABLE', 'EXECUTING', { retryFromState: 'EXECUTING' })).toMatchObject({ ok: true })
    expect(transition('FAILED_RETRYABLE', 'ENABLING', { retryFromState: 'EXECUTING' })).toMatchObject({
      ok: false,
      code: 'LAUNCH_RETRY_PHASE_MISMATCH'
    })
  })

  it('returns an invalid transition result for an untrusted runtime state', () => {
    expect(() => transition('CORRUPTED' as GooglePmaxLaunchState, 'DRAFT')).not.toThrow()
    expect(transition('CORRUPTED' as GooglePmaxLaunchState, 'DRAFT')).toMatchObject({
      ok: false,
      code: 'LAUNCH_STATE_TRANSITION_INVALID'
    })
  })
})
