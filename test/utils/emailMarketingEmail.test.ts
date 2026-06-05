// test/utils/emailMarketingEmail.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSubscriberEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

describe('normalizeSubscriberEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeSubscriberEmail('  Paul@ADME.net.au ')).toBe('paul@adme.net.au')
  })
})

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('paul@adme.net.au')).toBe(true)
    expect(isValidEmail('a.b+tag@sub.example.com')).toBe(true)
  })
  it('rejects malformed or empty addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
    expect(isValidEmail('two@@at.com')).toBe(false)
    expect(isValidEmail('spaces in@email.com')).toBe(false)
  })
  it('rejects addresses over 254 chars', () => {
    expect(isValidEmail('a'.repeat(250) + '@x.com')).toBe(false)
  })
})
