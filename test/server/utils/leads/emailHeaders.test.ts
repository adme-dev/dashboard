import { describe, expect, it } from 'vitest'
import { singleEmailAddress, stripHeaderBreaks } from '~~/server/utils/leads/emailHeaders'

describe('singleEmailAddress', () => {
  it('accepts and trims one plain address', () => {
    expect(singleEmailAddress(' jane.doe+quote@acme.com.au ')).toBe('jane.doe+quote@acme.com.au')
  })

  it.each([
    '', 'jane', 'jane@acme', 'a,b@acme.co', 'a;b@acme.co', 'a:b@acme.co', '@acme.co', 'jane@@acme.co', 'a@b.co,c@d.co', 'a@b.co c@d.co',
    'Jane <jane@acme.co>', '"jane"@acme.co', 'jane@acme.co\r\nBcc: x@y.co',
    `${'a'.repeat(250)}@b.co`
  ])('rejects %j', (value) => {
    expect(singleEmailAddress(value)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(singleEmailAddress(undefined)).toBeNull()
    expect(singleEmailAddress(42)).toBeNull()
  })
})

describe('stripHeaderBreaks', () => {
  it('collapses line breaks and control characters', () => {
    expect(stripHeaderBreaks(' a\r\nb\u0000c d  e ')).toBe('a b c d e')
  })
})
