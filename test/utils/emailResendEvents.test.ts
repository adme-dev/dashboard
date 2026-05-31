import { describe, it, expect } from 'vitest'
import { RESEND_EVENT_MAP, ruleForResendType } from '~~/server/utils/email-marketing/resendEvents'

describe('RESEND_EVENT_MAP', () => {
  it('covers the six Resend event types', () => {
    expect(Object.keys(RESEND_EVENT_MAP).sort()).toEqual([
      'email.bounced', 'email.clicked', 'email.complained',
      'email.delivered', 'email.opened', 'email.sent'
    ])
  })

  it('does not re-count sent (already counted at send time)', () => {
    expect(RESEND_EVENT_MAP['email.sent'].counterColumn).toBeNull()
  })

  it('maps delivered/opened/clicked to their counter columns, no suppression', () => {
    expect(RESEND_EVENT_MAP['email.delivered']).toEqual({ eventType: 'delivered', counterColumn: 'delivered', suppress: false })
    expect(RESEND_EVENT_MAP['email.opened'].counterColumn).toBe('opened')
    expect(RESEND_EVENT_MAP['email.clicked'].counterColumn).toBe('clicked')
  })

  it('suppresses on hard bounce and complaint', () => {
    expect(RESEND_EVENT_MAP['email.bounced'].suppress).toBe('hard_bounce')
    expect(RESEND_EVENT_MAP['email.complained'].suppress).toBe('complaint')
  })

  it('ruleForResendType returns null for unknown types', () => {
    expect(ruleForResendType('email.scheduled')).toBeNull()
    expect(ruleForResendType('nonsense')).toBeNull()
  })
})
