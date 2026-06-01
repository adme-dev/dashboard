// server/utils/crm/csv.ts
// Minimal dependency-free CSV parser (ported from the leads importer) + key normaliser.

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
