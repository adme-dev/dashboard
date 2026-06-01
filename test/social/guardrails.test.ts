import { describe, it, expect } from 'vitest'
import {
  detectReplyRisk,
  isWithinBusinessHours,
  evaluateRuleConditions,
} from '~~/server/utils/socialInbox/guardrails'
import type { RuleConditions, BusinessHours, AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

const baseCtx = (over: Partial<AutomationContext> = {}): AutomationContext => ({
  conversationId: 'c1', clientId: 'cl1', platform: 'facebook', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'love this!', participantName: 'Sam',
  now: new Date('2026-06-01T03:00:00Z'), ...over,
})

describe('detectReplyRisk — HARD negative-sentiment→human guard', () => {
  it('flags legal/complaint/PR-risk keywords', () => {
    for (const txt of ['I will sue you', 'this is a scam', 'refund now or I report you',
                        'worst service ever, disgusting', 'I want a lawyer', 'you stole my money']) {
      expect(detectReplyRisk(txt).risky, txt).toBe(true)
    }
  })
  it('flags common complaint words missing from a naive list', () => {
    for (const txt of ['absolutely horrible service', 'so rude to me', 'the product was broken',
                        'arrived defective', 'you overcharged me', 'this is misleading', 'what a liar']) {
      expect(detectReplyRisk(txt).risky, txt).toBe(true)
    }
  })
  it('does not flag ordinary positive/neutral comments', () => {
    for (const txt of ['love this product', 'when do you open?', 'great work team', 'nice colours']) {
      expect(detectReplyRisk(txt).risky, txt).toBe(false)
    }
  })
  it('is case- and punctuation-insensitive', () => {
    expect(detectReplyRisk('SCAM!!!').risky).toBe(true)
    expect(detectReplyRisk('Re-fund').risky).toBe(false) // hyphen split — not the word "refund"
  })
  it('returns reasons for audit', () => {
    const r = detectReplyRisk('this is a scam and I will sue')
    expect(r.risky).toBe(true)
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})

describe('isWithinBusinessHours', () => {
  const bh: BusinessHours = { tz: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
  it('true inside the window on a weekday', () => {
    expect(isWithinBusinessHours(new Date('2026-06-01T10:00:00Z'), bh)).toBe(true) // Mon 10:00 UTC
  })
  it('false before open', () => {
    expect(isWithinBusinessHours(new Date('2026-06-01T08:00:00Z'), bh)).toBe(false)
  })
  it('false on a weekend', () => {
    expect(isWithinBusinessHours(new Date('2026-06-06T10:00:00Z'), bh)).toBe(false) // Sat
  })
  it('null business_hours = always within (caller decides)', () => {
    expect(isWithinBusinessHours(new Date(), null)).toBe(true)
  })
})

describe('evaluateRuleConditions', () => {
  it('empty conditions match everything', () => {
    expect(evaluateRuleConditions(baseCtx(), {})).toBe(true)
  })
  it('rating range gates reviews', () => {
    const c: RuleConditions = { ratingMin: 4, ratingMax: 5 }
    expect(evaluateRuleConditions(baseCtx({ rating: 5 }), c)).toBe(true)
    expect(evaluateRuleConditions(baseCtx({ rating: 2 }), c)).toBe(false)
    expect(evaluateRuleConditions(baseCtx({ rating: null }), c)).toBe(false) // range set but no rating
  })
  it('keywordsAny requires at least one', () => {
    const c: RuleConditions = { keywordsAny: ['price', 'cost'] }
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'what is the price?' }), c)).toBe(true)
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'nice photo' }), c)).toBe(false)
  })
  it('keywordsNone excludes', () => {
    const c: RuleConditions = { keywordsNone: ['urgent'] }
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'this is urgent' }), c)).toBe(false)
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'all good' }), c)).toBe(true)
  })
  it('businessHoursOnly is NOT evaluated here (engine handles it via business_hours)', () => {
    // conditions.businessHoursOnly is a flag the engine reads; evaluateRuleConditions ignores it
    expect(evaluateRuleConditions(baseCtx(), { businessHoursOnly: true })).toBe(true)
  })
})
