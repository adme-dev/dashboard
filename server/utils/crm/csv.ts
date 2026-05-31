// server/utils/crm/csv.ts
// Minimal dependency-free CSV parser (ported from the leads importer) + key normaliser.

export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
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
