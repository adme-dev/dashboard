// server/utils/crm/exportRecords.ts
// F9 — export the *current filtered view* of a CRM list to CSV or XLSX. Reuses the
// same filter grammar + client/visibility scoping as the list endpoints, so an
// export contains exactly the rows the list would show (sans pagination).
import JSZip from 'jszip'
import { queryRows } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'
import { buildFilterConds, type FilterClause } from '~~/server/utils/crm/filters'
import { toCsv } from '~~/server/utils/crm/csv'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { visibilityCondsForContext } from '~~/server/utils/crm/queryScope'

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
  entity: ExportEntity, scope: string | CrmSearchContext,
  opts: { q?: string, filters?: FilterClause[], extraConds?: Cond[] },
  deps: { queryRows: typeof queryRows } = { queryRows },
): Promise<Record<string, unknown>[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  const type = entity === 'people' ? 'person' : entity === 'companies' ? 'company' : 'opportunity'
  const conds: Cond[] = [
    ...(typeof scope === 'string' ? [] : visibilityCondsForContext(scope, type, TABLE[entity])),
    ...(opts.extraConds ?? []),
    ...searchCond(entity, opts.q),
    ...buildFilterConds(entity, opts.filters)
  ]
  const { where, params } = buildWhere(clientId, conds)
  const cols = EXPORT_COLUMNS[entity].join(', ')
  return await deps.queryRows<Record<string, unknown>>(
    `SELECT ${cols} FROM ${TABLE[entity]} ${where} ORDER BY created_at DESC LIMIT ${MAX_EXPORT}`,
    params,
  )
}

export async function buildExportFile(
  entity: ExportEntity, rows: Record<string, unknown>[], format: ExportFormat,
): Promise<{ body: string | Buffer, contentType: string, filename: string }> {
  const columns = EXPORT_COLUMNS[entity]
  const stamp = entity
  if (format === 'xlsx') {
    // Normalise arrays (tags) to strings so the sheet shows them readably.
    const flat = rows.map(r => {
      const o: Record<string, unknown> = {}
      for (const c of columns) o[c] = Array.isArray(r[c]) ? (r[c] as unknown[]).join('; ') : r[c]
      return o
    })
    const body = await buildXlsxBuffer('CRM', columns, flat)
    return { body, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${stamp}.xlsx` }
  }
  return { body: toCsv(rows, columns), contentType: 'text/csv; charset=utf-8', filename: `${stamp}.csv` }
}

async function buildXlsxBuffer(
  sheetName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const archive = new JSZip()
  archive.file('[Content_Types].xml', contentTypesXml())
  archive.folder('_rels')!.file('.rels', packageRelationshipsXml())
  archive.folder('xl')!.file('workbook.xml', workbookXml(sheetName))
  archive.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', workbookRelationshipsXml())
  archive.folder('xl')!.folder('worksheets')!.file('sheet1.xml', worksheetXml(columns, rows))

  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  return Buffer.from(bytes)
}

function worksheetXml(columns: string[], rows: Record<string, unknown>[]): string {
  const sheetRows = [
    columns.map(column => column),
    ...rows.map(row => columns.map(column => row[column]))
  ]
  const body = sheetRows.map((values, rowIndex) => {
    const cells = values.map((value, columnIndex) => xlsxCell(value, columnIndex, rowIndex + 1)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')

  return xml(`
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>${body}</sheetData>
    </worksheet>
  `)
}

function xlsxCell(value: unknown, columnIndex: number, rowIndex: number): string {
  const reference = `${xlsxColumnName(columnIndex)}${rowIndex}`
  if (value === null || value === undefined) return `<c r="${reference}"/>`
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" t="n"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
}

function xlsxColumnName(index: number): string {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function workbookXml(sheetName: string): string {
  return xml(`
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
    </workbook>
  `)
}

function workbookRelationshipsXml(): string {
  return xml(`
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    </Relationships>
  `)
}

function packageRelationshipsXml(): string {
  return xml(`
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>
  `)
}

function contentTypesXml(): string {
  return xml(`
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>
  `)
}

function xml(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value.replace(/>\s+</g, '><').trim()}`
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '\uFFFD')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
