import { describe, it, expect } from 'vitest'
import {
  parseRecipients,
  isValidEmail,
  scheduleSummary,
  type ScheduleSummaryInput,
} from '~/app/utils/socialReportScheduleForm'

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('paul@adme.net.au')).toBe(true)
  })
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'paul', 'paul@', '@adme.net', 'a b@c.com', 'no-at-sign.com']) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })
})

describe('parseRecipients', () => {
  it('splits on commas, semicolons, whitespace and newlines', () => {
    expect(parseRecipients('a@x.com, b@x.com;c@x.com\n d@x.com')).toEqual([
      'a@x.com', 'b@x.com', 'c@x.com', 'd@x.com',
    ])
  })
  it('drops invalid entries and trims', () => {
    expect(parseRecipients('  good@x.com , nope , also@y.com ')).toEqual([
      'good@x.com', 'also@y.com',
    ])
  })
  it('lowercases and de-duplicates while preserving first-seen order', () => {
    expect(parseRecipients('B@x.com, a@x.com, b@X.com')).toEqual(['b@x.com', 'a@x.com'])
  })
  it('returns an empty array for empty / whitespace input', () => {
    expect(parseRecipients('')).toEqual([])
    expect(parseRecipients('   \n  ')).toEqual([])
  })
})

describe('scheduleSummary', () => {
  const base: ScheduleSummaryInput = { cadence: 'monthly', window_days: 30, platform: null, recipients: ['a@x.com', 'b@x.com'] }
  it('describes cadence, window, audience and recipient count', () => {
    expect(scheduleSummary(base)).toBe('Monthly · last 30 days · all networks · 2 recipients')
  })
  it('names a single platform and singular recipient', () => {
    expect(scheduleSummary({ cadence: 'weekly', window_days: 7, platform: 'facebook', recipients: ['x@y.com'] }))
      .toBe('Weekly · last 7 days · Facebook · 1 recipient')
  })
  it('flags an empty recipient list', () => {
    expect(scheduleSummary({ ...base, recipients: [] })).toBe('Monthly · last 30 days · all networks · no recipients')
  })
})
