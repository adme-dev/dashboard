// server/utils/email-marketing/importParse.ts
// Pure mapping of raw CSV text into validated SubscriberInput records.
// Auto-detects email/name columns; everything else becomes an attrib.
// columnMapping (header verbatim -> role) overrides auto-detection:
//   role is 'email' | 'name' | 'ignore' | any custom attrib key.

import { parseEmailMarketingCsv } from './csv'
import { normalizeSubscriberEmail, isValidEmail } from './email'
import type { SubscriberInput } from './types'

const EMAIL_HEADERS = new Set(['email', 'email address', 'e-mail', 'email_address'])
const NAME_HEADERS = new Set(['name', 'full name', 'full_name', 'first name', 'first_name'])

export interface CsvImportParse {
  subscribers: Array<SubscriberInput & { row: number }>
  errors: Array<{ row: number, message: string }>
  total: number
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function parseSubscriberCsv(
  csvText: string,
  columnMapping?: Record<string, string>
): CsvImportParse {
  const rows = parseEmailMarketingCsv(csvText)
  if (rows.length < 2) {
    return { subscribers: [], errors: [{ row: 0, message: 'empty_csv' }], total: 0 }
  }

  const headers = (rows[0] ?? []).map(h => h.trim())
  // Resolve each column to a role: 'email' | 'name' | 'ignore' | 'attr:<key>'
  const roles = headers.map((h) => {
    const lower = h.toLowerCase()
    if (columnMapping && columnMapping[h]) {
      const m = columnMapping[h]
      if (m === 'email' || m === 'name' || m === 'ignore') return m
      return `attr:${normalizeKey(m)}`
    }
    if (EMAIL_HEADERS.has(lower)) return 'email'
    if (NAME_HEADERS.has(lower)) return 'name'
    const k = normalizeKey(h)
    return k ? `attr:${k}` : 'ignore'
  })

  const emailIdx = roles.indexOf('email')
  if (emailIdx === -1) {
    return { subscribers: [], errors: [{ row: 0, message: 'no_email_column' }], total: 0 }
  }

  const subscribers: Array<SubscriberInput & { row: number }> = []
  const errors: Array<{ row: number, message: string }> = []
  const seen = new Set<string>()
  const dataRows = rows.slice(1)

  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r] ?? []
    const rowNum = r + 1 // 1-indexed data row (header excluded)
    if (cols.every(c => !c.trim())) continue

    const rawEmail = (cols[emailIdx] ?? '').trim()
    if (!isValidEmail(rawEmail)) {
      errors.push({ row: rowNum, message: 'invalid_email' })
      continue
    }
    const email = normalizeSubscriberEmail(rawEmail)
    if (seen.has(email)) {
      errors.push({ row: rowNum, message: 'duplicate_in_file' })
      continue
    }
    seen.add(email)

    let name: string | null = null
    const attribs: Record<string, unknown> = {}
    roles.forEach((role, idx) => {
      const val = (cols[idx] ?? '').trim()
      if (!val) return
      if (role === 'name') {
        name = val
        return
      }
      if (role === 'email' || role === 'ignore') return
      if (role.startsWith('attr:')) attribs[role.slice(5)] = val
    })

    subscribers.push({ email, name, attribs, row: rowNum })
  }

  return { subscribers, errors, total: subscribers.length }
}
