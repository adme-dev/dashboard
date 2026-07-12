import { describe, expect, it } from 'vitest'
import { decideRoleAcknowledgement } from '~~/server/utils/hr/roleAcknowledgement'

describe('role acknowledgement transition policy', () => {
  it.each(['acknowledged', 'disputed'] as const)('allows the first %s response', (status) => {
    expect(decideRoleAcknowledgement('pending', status)).toBe('apply')
  })

  it.each(['acknowledged', 'disputed'] as const)('makes a repeated %s response idempotent', (status) => {
    expect(decideRoleAcknowledgement(status, status)).toBe('unchanged')
  })

  it('rejects rewriting an acknowledgement as a dispute', () => {
    expect(decideRoleAcknowledgement('acknowledged', 'disputed')).toBe('reject')
  })

  it('rejects rewriting a dispute as an acknowledgement', () => {
    expect(decideRoleAcknowledgement('disputed', 'acknowledged')).toBe('reject')
  })
})
