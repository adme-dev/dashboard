import { describe, expect, it } from 'vitest'
import { safeCsvCell, serializeSafeCsv } from '~~/server/utils/safeCsv'

describe('safeCsvCell', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@IMPORTXML("x")', '\t=1', '\r=1'])(
    'neutralizes spreadsheet formula input %j',
    (value) => {
      expect(safeCsvCell(value).replace(/^"|"$/g, '')).toMatch(/^'/)
    },
  )

  it('quotes commas, quotes and newlines using RFC 4180 escaping', () => {
    expect(safeCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
  })
})

describe('serializeSafeCsv', () => {
  it('uses stable headers and CRLF rows', () => {
    expect(serializeSafeCsv(['Campaign', 'Risk'], [
      ['Generic', '=malicious'],
    ])).toBe("Campaign,Risk\r\nGeneric,'=malicious")
  })
})
