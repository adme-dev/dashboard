// server/utils/email-marketing/csv.ts
// Minimal CSV parser. Handles quoted fields, escaped quotes ("" -> "), and
// CRLF/LF line endings. Ported from the leads importer so both stay consistent.
// For pathological input we'd reach for papaparse, but that adds ~50KB to the bundle.

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
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      if (row.length > 1 || row[0].trim() !== '') rows.push(row)
      row = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }
  row.push(cell)
  if (row.length > 1 || row[0].trim() !== '') rows.push(row)
  return rows
}
