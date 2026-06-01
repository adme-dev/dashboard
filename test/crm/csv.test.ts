import { describe, it, expect } from 'vitest'
import { parseCsv, normalizeKey, toCsv, csvCell } from '~~/server/utils/crm/csv'

describe('csvCell', () => {
  it('joins arrays, stringifies objects, blanks null', () => {
    expect(csvCell(['a', 'b'])).toBe('a; b')
    expect(csvCell(null)).toBe('')
    expect(csvCell({ x: 1 })).toBe('{"x":1}')
    expect(csvCell(42)).toBe('42')
  })
})

describe('toCsv', () => {
  it('emits a header row then ordered, escaped cells', () => {
    const out = toCsv([{ name: 'Acme, Inc', tags: ['vip'], note: 'say "hi"' }], ['name', 'tags', 'note'])
    expect(out).toBe('name,tags,note\r\n"Acme, Inc",vip,"say ""hi"""')
  })
  it('round-trips through parseCsv', () => {
    const csv = toCsv([{ a: '1', b: 'x,y' }], ['a', 'b'])
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['1', 'x,y']])
  })
})

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
