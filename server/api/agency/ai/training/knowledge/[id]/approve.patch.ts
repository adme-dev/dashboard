import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID is required' })
  }

  const row = await queryOne<any>(`
    UPDATE ai_training_knowledge
    SET is_approved = true,
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, user.id])

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
