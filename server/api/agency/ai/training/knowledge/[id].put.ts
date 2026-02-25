import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

const VALID_TYPES = ['sop', 'client_context', 'qa_pair', 'workflow', 'glossary']

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID is required' })
  }

  // Build dynamic SET clause
  const setClauses: string[] = ['updated_at = NOW()']
  const params: any[] = [id]
  let paramIndex = 2

  if (body.title !== undefined) {
    if (!body.title?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Title cannot be empty' })
    }
    setClauses.push(`title = $${paramIndex}`)
    params.push(body.title.trim())
    paramIndex++
  }

  if (body.content !== undefined) {
    if (!body.content?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Content cannot be empty' })
    }
    setClauses.push(`content = $${paramIndex}`)
    params.push(body.content.trim())
    paramIndex++
  }

  if (body.answer !== undefined) {
    setClauses.push(`answer = $${paramIndex}`)
    params.push(body.answer?.trim() || null)
    paramIndex++
  }

  if (body.category !== undefined) {
    setClauses.push(`category = $${paramIndex}`)
    params.push(body.category?.trim() || null)
    paramIndex++
  }

  if (body.tags !== undefined) {
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim().toLowerCase())
      : typeof body.tags === 'string'
        ? body.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
        : []
    setClauses.push(`tags = $${paramIndex}`)
    params.push(tags)
    paramIndex++
  }

  if (body.knowledgeType !== undefined) {
    if (!VALID_TYPES.includes(body.knowledgeType)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid knowledgeType' })
    }
    setClauses.push(`knowledge_type = $${paramIndex}`)
    params.push(body.knowledgeType)
    paramIndex++
  }

  if (body.isApproved !== undefined) {
    setClauses.push(`is_approved = $${paramIndex}`)
    params.push(!!body.isApproved)
    paramIndex++
  }

  const row = await queryOne<any>(`
    UPDATE ai_training_knowledge
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *
  `, params)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Knowledge entry not found' })
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
