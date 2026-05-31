import { describe, it, expect } from 'vitest'
import { parseCsv, normalizeKey } from '~~/server/utils/crm/csv'

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x,1","say ""hi"""\n')
    expect(rows).toEqual([['a', 'b'], ['x,1', 'say "hi"']])
  })
  it('skips fully blank lines', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], ['b']])
  })
})

describe('normalizeKey', () => {
  it('lowercases, underscores spaces, strips junk', () => {
    expect(normalizeKey('  First Name! ')).toBe('first_name')
  })
})
