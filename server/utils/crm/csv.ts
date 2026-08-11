// server/utils/crm/csv.ts
// Minimal dependency-free CSV parser (ported from the leads importer) + key normaliser.
import { queryOne, queryRows } from '~~/server/utils/db'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { buildWhere, visibilityCondsForContext } from '~~/server/utils/crm/queryScope'

export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** Serialise one value for a CSV cell: arrays join with "; ", objects JSON, null → ''. */
export function csvCell(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join('; ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Build an RFC-4180 CSV string from rows + an ordered column list. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
  const lines = [columns.map(esc).join(',')]
  for (const r of rows) lines.push(columns.map(c => esc(csvCell(r[c]))).join(','))
  return lines.join('\r\n')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      cell += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') {
      row.push(cell)
      if (row.length > 1 || (row[0] ?? '').trim() !== '') rows.push(row)
      row = []; cell = ''; i++; continue
    }
    cell += ch; i++
  }
  row.push(cell)
  if (row.length > 1 || (row[0] ?? '').trim() !== '') rows.push(row)
  return rows
}

type PersonImportColumn = 'first_name' | 'last_name' | 'email' | 'phone' | 'mobile' | 'job_title' | 'department' | 'city'

const PERSON_HEADER_MAP: Record<string, PersonImportColumn> = {
  first_name: 'first_name', firstname: 'first_name', first: 'first_name',
  last_name: 'last_name', lastname: 'last_name', last: 'last_name', surname: 'last_name',
  email: 'email', email_address: 'email',
  phone: 'phone', phone_number: 'phone', mobile: 'mobile',
  job_title: 'job_title', title: 'job_title', department: 'department', city: 'city'
}

export interface PeopleImportResult {
  imported: number
  skipped: number
  errors: Array<{ row: number, message: string }>
}

export interface PeopleImportDependencies {
  queryRows: (sql: string, params?: unknown[]) => Promise<unknown[]>
  queryOne: (sql: string, params?: unknown[]) => Promise<unknown>
}

const defaultPeopleImportDependencies: PeopleImportDependencies = { queryRows, queryOne }

/** Import agency-owned people without exposing hidden duplicate rows or DB details. */
export async function importPeopleCsv(
  context: CrmSearchContext,
  csv: string,
  deps: PeopleImportDependencies = defaultPeopleImportDependencies
): Promise<PeopleImportResult> {
  const rows = parseCsv(csv)
  if (rows.length < 2) throw createError({ statusCode: 400, statusMessage: 'CSV has no data rows' })
  const headers = rows[0]!.map(normalizeKey)
  const result: PeopleImportResult = { imported: 0, skipped: 0, errors: [] }

  for (let index = 1; index < rows.length; index++) {
    const columns = rows[index]!
    if (columns.every(column => !column.trim())) continue
    const record: Partial<Record<PersonImportColumn, string>> = {}
    headers.forEach((header, columnIndex) => {
      const target = PERSON_HEADER_MAP[header]
      const value = columns[columnIndex]?.trim()
      if (target && value) record[target] = value
    })
    if (!record.first_name) {
      result.errors.push({ row: index + 1, message: 'missing first_name' })
      continue
    }

    try {
      if (record.email) {
        const { where, params } = buildWhere(context.clientId, [
          ...visibilityCondsForContext(context, 'person', 'crm_people'),
          { sql: 'lower(crm_people.email) = lower(?)', params: [record.email] }
        ])
        const duplicate = await deps.queryRows(`SELECT crm_people.id FROM crm_people ${where} LIMIT 1`, params)
        if (duplicate.length) {
          result.skipped++
          continue
        }
      }
      await deps.queryOne(
        `INSERT INTO crm_people
           (client_id, first_name, last_name, email, phone, mobile, job_title, department, city, owner_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [context.clientId, record.first_name, record.last_name ?? null, record.email ?? null,
          record.phone ?? null, record.mobile ?? null, record.job_title ?? null,
          record.department ?? null, record.city ?? null, context.actorId]
      )
      result.imported++
    } catch {
      result.errors.push({ row: index + 1, message: 'insert_failed' })
    }
  }
  return result
}
