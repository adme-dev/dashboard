// server/utils/crm/exportRecords.ts
// F9 — export the *current filtered view* of a CRM list to CSV or XLSX. Reuses the
// same filter grammar + client/visibility scoping as the list endpoints, so an
// export contains exactly the rows the list would show (sans pagination).
import * as XLSX from 'xlsx'
import { queryRows } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'
import { buildFilterConds, type FilterClause } from '~~/server/utils/crm/filters'
import { toCsv } from '~~/server/utils/crm/csv'

export type ExportEntity = 'people' | 'companies' | 'opportunities'
export type ExportFormat = 'csv' | 'xlsx'

const TABLE: Record<ExportEntity, string> = {
  people: 'crm_people', companies: 'crm_companies', opportunities: 'crm_opportunities',
}

export const EXPORT_COLUMNS: Record<ExportEntity, string[]> = {
  people: ['first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'department', 'city', 'lifecycle_stage', 'tags', 'created_at'],
  companies: ['name', 'domain', 'phone', 'city', 'state', 'country', 'lifecycle_stage', 'tags', 'created_at'],
  opportunities: ['name', 'amount', 'probability', 'status', 'stage_id', 'expected_close_date', 'source', 'created_at'],
}

// Free-text search cond per entity (mirrors the list endpoints' ILIKE search).
function searchCond(entity: ExportEntity, q: string | undefined): Cond[] {
  if (!q) return []
  const like = '%' + q.replace(/[%_]/g, c => '\\' + c) + '%'
  if (entity === 'people') return [{ sql: '(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)', params: [like, like, like] }]
  if (entity === 'companies') return [{ sql: '(name ILIKE ? OR domain ILIKE ?)', params: [like, like] }]
  return [{ sql: 'name ILIKE ?', params: [like] }]
}

const MAX_EXPORT = 10000

export async function fetchExportRows(
  entity: ExportEntity, clientId: string,
  opts: { q?: string, filters?: FilterClause[], extraConds?: Cond[] },
): Promise<Record<string, unknown>[]> {
  const conds: Cond[] = [...(opts.extraConds ?? []), ...searchCond(entity, opts.q), ...buildFilterConds(entity, opts.filters)]
  const { where, params } = buildWhere(clientId, conds)
  const cols = EXPORT_COLUMNS[entity].join(', ')
  return await queryRows<Record<string, unknown>>(
    `SELECT ${cols} FROM ${TABLE[entity]} ${where} ORDER BY created_at DESC LIMIT ${MAX_EXPORT}`,
    params,
  )
}

export function buildExportFile(
  entity: ExportEntity, rows: Record<string, unknown>[], format: ExportFormat,
): { body: string | Buffer, contentType: string, filename: string } {
  const columns = EXPORT_COLUMNS[entity]
  const stamp = entity
  if (format === 'xlsx') {
    // Normalise arrays (tags) to strings so the sheet shows them readably.
    const flat = rows.map(r => {
      const o: Record<string, unknown> = {}
      for (const c of columns) o[c] = Array.isArray(r[c]) ? (r[c] as unknown[]).join('; ') : r[c]
      return o
    })
    const ws = XLSX.utils.json_to_sheet(flat, { header: columns })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CRM')
    const body = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return { body, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${stamp}.xlsx` }
  }
  return { body: toCsv(rows, columns), contentType: 'text/csv; charset=utf-8', filename: `${stamp}.csv` }
}
