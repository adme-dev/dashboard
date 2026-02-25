import { queryOne, queryRows } from '~~/server/utils/db'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import type { H3Event } from 'h3'

type TrainingKnowledgeType = 'sop' | 'client_context' | 'qa_pair' | 'workflow' | 'glossary'

interface UploadResult {
  imported: number
  skipped: number
  errors: string[]
}

interface DuplicateCandidate {
  id: string
  title: string
  score: number
}

// ---------------------------------------------------------------------------
// CSV Parser — handles quoted fields with embedded commas/newlines
// ---------------------------------------------------------------------------
function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") inside a quoted field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase().trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function parseJsonl(content: string): Record<string, any>[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  const rows: Record<string, any>[] = []
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line))
    } catch {
      // skip malformed lines — tracked as errors by caller
      rows.push({})
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Row → INSERT mapping per knowledge type
// ---------------------------------------------------------------------------
function mapRow(
  raw: Record<string, any>,
  knowledgeType: TrainingKnowledgeType,
): { title: string; content: string; answer: string | null; category: string | null; tags: string[]; clientName?: string } | null {
  let title: string
  let content: string
  let answer: string | null = null
  let category: string | null = null
  let tags: string[] = []

  switch (knowledgeType) {
    case 'sop':
    case 'workflow':
      title = (raw.title ?? '').toString().trim()
      content = (raw.content ?? '').toString().trim()
      category = (raw.category ?? '').toString().trim() || null
      tags = parseTags(raw.tags)
      break

    case 'client_context':
      title = (raw.title ?? '').toString().trim()
      content = (raw.content ?? '').toString().trim()
      category = (raw.category ?? '').toString().trim() || null
      tags = parseTags(raw.tags)
      break

    case 'qa_pair':
      title = (raw.question ?? '').toString().trim()
      content = (raw.question ?? '').toString().trim()
      answer = (raw.answer ?? '').toString().trim() || null
      category = (raw.category ?? '').toString().trim() || null
      tags = parseTags(raw.tags)
      break

    case 'glossary':
      title = (raw.term ?? '').toString().trim()
      content = (raw.definition ?? '').toString().trim()
      category = (raw.category ?? '').toString().trim() || null
      break

    default:
      return null
  }

  // Validation
  if (!title || !content) return null
  if (title.length > 500) title = title.slice(0, 500)

  return { title, content, answer, category, tags }
}

function parseTags(raw: any): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  return String(raw).split(',').map(t => t.trim()).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Bulk Upload
// ---------------------------------------------------------------------------
export async function uploadKnowledgeBulk(
  fileContent: string,
  format: 'csv' | 'jsonl',
  knowledgeType: TrainingKnowledgeType,
  createdBy: string,
): Promise<UploadResult> {
  const rows = format === 'csv' ? parseCsv(fileContent) : parseJsonl(fileContent)

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const lineNum = i + 1
    const raw = rows[i]
    const mapped = mapRow(raw, knowledgeType)

    if (!mapped) {
      skipped++
      errors.push(`Row ${lineNum}: missing required title or content`)
      continue
    }

    try {
      await queryOne(`
        INSERT INTO ai_training_knowledge
          (knowledge_type, title, content, answer, category, tags, source, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, 'bulk_upload', $7)
        RETURNING id
      `, [
        knowledgeType,
        mapped.title,
        mapped.content,
        mapped.answer,
        mapped.category,
        mapped.tags,
        createdBy,
      ])
      imported++
    } catch (err: any) {
      skipped++
      errors.push(`Row ${lineNum}: ${err.message ?? 'insert failed'}`)
    }
  }

  return { imported, skipped, errors }
}

// ---------------------------------------------------------------------------
// Deduplication via Vectorize
// ---------------------------------------------------------------------------
export async function deduplicateKnowledge(
  knowledgeId: string,
  event?: H3Event,
): Promise<{ duplicates: DuplicateCandidate[] }> {
  const entry = await queryOne<{ id: string; title: string; content: string }>(
    `SELECT id, title, content FROM ai_training_knowledge WHERE id = $1`,
    [knowledgeId],
  )
  if (!entry) {
    return { duplicates: [] }
  }

  const searchText = `${entry.title} ${entry.content}`.slice(0, 2000)

  try {
    const results = event
      ? await searchSimilar(event, searchText, 10)
      : await searchSimilar(searchText, 10)

    const duplicates = results
      .filter(r => r.id !== knowledgeId && r.score > 0.92)
      .map(r => ({ id: r.id, title: r.metadata?.title ?? '', score: r.score }))

    return { duplicates }
  } catch {
    // Graceful degradation: Vectorize unavailable
    return { duplicates: [] }
  }
}
