import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const formData = await readMultipartFormData(event)

  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data' })
  }

  let projectId = ''
  let name = ''
  let fileBuffer: Buffer | null = null
  let fileName = ''
  let fileMime = ''

  for (const part of formData) {
    if (part.name === 'projectId') projectId = part.data.toString('utf-8')
    else if (part.name === 'name') name = part.data.toString('utf-8')
    else if (part.name === 'file') {
      fileBuffer = part.data
      fileName = part.filename || 'data.csv'
      fileMime = part.type || ''
    }
  }

  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  if (!fileBuffer) throw createError({ statusCode: 400, statusMessage: 'file is required' })
  if (!name) name = fileName.replace(/\.[^/.]+$/, '')

  // Size check: 5MB max
  if (fileBuffer.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'File too large (max 5MB)' })
  }

  const content = fileBuffer.toString('utf-8')
  const isJson = fileName.endsWith('.json') || fileMime === 'application/json'

  let rows: Record<string, string>[]
  let columns: { name: string; type: string }[]

  if (isJson) {
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'JSON must be a non-empty array of objects' })
    }
    rows = parsed.map((obj: any) => {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) {
        row[k] = String(v ?? '')
      }
      return row
    })
    const colNames = Object.keys(parsed[0])
    columns = colNames.map(n => ({ name: n, type: detectColumnType(rows, n) }))
  } else {
    // Parse CSV
    const lines = parseCSV(content)
    if (lines.length < 2) {
      throw createError({ statusCode: 400, statusMessage: 'CSV must have a header row and at least one data row' })
    }
    const headers = lines[0]
    rows = lines.slice(1).map(fields => {
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = fields[i] || '' })
      return row
    })
    columns = headers.map(n => ({ name: n, type: detectColumnType(rows, n) }))
  }

  // Validate limits
  if (rows.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Too many rows (max 10,000)' })
  }
  if (columns.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Too many columns (max 100)' })
  }

  const feedId = randomUUID()
  const r2Key = `banner-feeds/${feedId}/data.json`
  const jsonBuffer = Buffer.from(JSON.stringify(rows), 'utf-8')
  const { url: dataUrl } = await uploadFile(jsonBuffer, r2Key, 'application/json')

  const sampleData = rows.slice(0, 5)

  const feed = await queryOne(`
    INSERT INTO banner_feeds (id, project_id, name, source_type, columns, row_count, r2_key, data_url, sample_data, uploaded_by)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10)
    RETURNING id, project_id AS "projectId", name, source_type AS "sourceType",
              columns, row_count AS "rowCount", r2_key AS "r2Key",
              data_url AS "dataUrl", sample_data AS "sampleData",
              uploaded_by AS "uploadedBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
  `, [feedId, projectId, name, isJson ? 'json' : 'csv', JSON.stringify(columns), rows.length, r2Key, dataUrl, JSON.stringify(sampleData), user.id])

  return feed
})

function parseCSV(content: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const next = content[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        current.push(field.trim())
        field = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        current.push(field.trim())
        field = ''
        if (current.some(f => f !== '')) rows.push(current)
        current = []
        if (ch === '\r') i++ // skip \n in \r\n
      } else {
        field += ch
      }
    }
  }
  // Last field/row
  current.push(field.trim())
  if (current.some(f => f !== '')) rows.push(current)

  return rows
}

function detectColumnType(rows: Record<string, string>[], columnName: string): string {
  const sample = rows.slice(0, 20).map(r => r[columnName]).filter(v => v && v.trim())
  if (sample.length === 0) return 'text'

  const urlPattern = /^https?:\/\//i
  const colorPattern = /^#[0-9a-f]{3,8}$/i

  let urlCount = 0, colorCount = 0, numberCount = 0
  for (const val of sample) {
    if (urlPattern.test(val)) urlCount++
    else if (colorPattern.test(val)) colorCount++
    else if (!isNaN(parseFloat(val)) && isFinite(Number(val))) numberCount++
  }

  const threshold = sample.length * 0.6
  if (urlCount >= threshold) return 'url'
  if (colorCount >= threshold) return 'color'
  if (numberCount >= threshold) return 'number'
  return 'text'
}
