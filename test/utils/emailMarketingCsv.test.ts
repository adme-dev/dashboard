// test/utils/emailMarketingCsv.test.ts
import { describe, it, expect } from 'vitest'
import { parseEmailMarketingCsv } from '~~/server/utils/email-marketing/csv'

describe('parseEmailMarketingCsv', () => {
  it('parses a simple header + rows', () => {
    expect(parseEmailMarketingCsv('email,name\na@x.com,Alice\nb@y.com,Bob')).toEqual([
      ['email', 'name'],
      ['a@x.com', 'Alice'],
      ['b@y.com', 'Bob']
    ])
  })
  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseEmailMarketingCsv('email,note\na@x.com,"Hello, ""world"""')).toEqual([
      ['email', 'note'],
      ['a@x.com', 'Hello, "world"']
    ])
  })
  it('handles CRLF line endings and skips blank trailing lines', () => {
    expect(parseEmailMarketingCsv('email\r\na@x.com\r\n\r\n')).toEqual([
      ['email'],
      ['a@x.com']
    ])
  })
})
