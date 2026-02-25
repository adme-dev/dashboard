import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

const VALID_TYPES = ['sop', 'client_context', 'qa_pair', 'workflow', 'glossary']

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  if (!body.knowledgeType || !VALID_TYPES.includes(body.knowledgeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid knowledgeType' })
  }
  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }
  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Content is required' })
  }

  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim().toLowerCase())
    : typeof body.tags === 'string'
      ? body.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : []

  const row = await queryOne<any>(`
    INSERT INTO ai_training_knowledge
      (knowledge_type, title, content, answer, category, tags, client_id, source, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    body.knowledgeType,
    body.title.trim(),
    body.content.trim(),
    body.answer?.trim() || null,
    body.category?.trim() || null,
    tags,
    body.clientId || null,
    body.source?.trim() || 'manual',
    user.id,
  ])

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create knowledge entry' })
  }

  return {
    id: row.id,
    knowledgeType: row.knowledge_type,
    title: row.title,
    content: row.content,
    answer: row.answer,
    category: row.category,
    tags: row.tags || [],
    clientId: row.client_id,
    source: row.source,
    sourceFile: row.source_file,
    isApproved: row.is_approved,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    embeddingId: row.embedding_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
