// test/utils/emailMarketingImportParse.test.ts
import { describe, it, expect } from 'vitest'
import { parseSubscriberCsv } from '~~/server/utils/email-marketing/importParse'

describe('parseSubscriberCsv', () => {
  it('auto-detects email + name columns and maps the rest to attribs', () => {
    const csv = 'Email,Full Name,Company\na@x.com,Alice,Acme\nb@y.com,Bob,Globex'
    const r = parseSubscriberCsv(csv)
    expect(r.total).toBe(2)
    expect(r.errors).toEqual([])
    expect(r.subscribers).toEqual([
      { email: 'a@x.com', name: 'Alice', attribs: { company: 'Acme' }, row: 1 },
      { email: 'b@y.com', name: 'Bob', attribs: { company: 'Globex' }, row: 2 }
    ])
  })

  it('records an error for rows with invalid/blank email and skips them', () => {
    const csv = 'email,name\nbad-email,Nope\nc@z.com,Cara'
    const r = parseSubscriberCsv(csv)
    expect(r.subscribers).toEqual([{ email: 'c@z.com', name: 'Cara', attribs: {}, row: 2 }])
    expect(r.errors).toEqual([{ row: 1, message: 'invalid_email' }])
  })

  it('dedupes repeated emails within the file (first wins)', () => {
    const csv = 'email,name\nd@z.com,First\nD@z.com,Second'
    const r = parseSubscriberCsv(csv)
    expect(r.subscribers).toEqual([{ email: 'd@z.com', name: 'First', attribs: {}, row: 1 }])
    expect(r.errors).toEqual([{ row: 2, message: 'duplicate_in_file' }])
  })

  it('honors an explicit column mapping and "ignore"', () => {
    const csv = 'Contact,Person,Junk\ne@z.com,Eve,xxx'
    const r = parseSubscriberCsv(csv, { Contact: 'email', Person: 'name', Junk: 'ignore' })
    expect(r.subscribers).toEqual([{ email: 'e@z.com', name: 'Eve', attribs: {}, row: 1 }])
  })

  it('errors when no email column can be resolved', () => {
    const r = parseSubscriberCsv('name,company\nAlice,Acme')
    expect(r.subscribers).toEqual([])
    expect(r.errors).toEqual([{ row: 0, message: 'no_email_column' }])
  })

  it('errors on an empty CSV', () => {
    const r = parseSubscriberCsv('email')
    expect(r.errors).toEqual([{ row: 0, message: 'empty_csv' }])
  })
})
