import { queryRows, queryCount } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const query = getQuery(event)

  const type = query.type as string | undefined
  const category = query.category as string | undefined
  const approved = query.approved as string | undefined
  const search = query.search as string | undefined
  const page = Math.max(parseInt(query.page as string) || 1, 1)
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 50, 1), 100)
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (type) {
    conditions.push(`k.knowledge_type = $${paramIndex}`)
    params.push(type)
    paramIndex++
  }

  if (category) {
    conditions.push(`k.category = $${paramIndex}`)
    params.push(category)
    paramIndex++
  }

  if (approved === 'true') {
    conditions.push(`k.is_approved = true`)
  } else if (approved === 'false') {
    conditions.push(`k.is_approved = false`)
  }

  if (search) {
    conditions.push(`(k.title ILIKE $${paramIndex} OR k.content ILIKE $${paramIndex})`)
    params.push(`%${search}%`)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [items, total] = await Promise.all([
    queryRows(`
      SELECT k.id, k.knowledge_type, k.title, k.content, k.answer,
             k.category, k.tags, k.client_id, k.source, k.source_file,
             k.is_approved, k.approved_by, k.approved_at,
             k.embedding_id, k.created_by, k.created_at, k.updated_at,
             tm.name as created_by_name
      FROM ai_training_knowledge k
      LEFT JOIN team_members tm ON tm.id = k.created_by
      ${whereClause}
      ORDER BY k.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryCount(`
      SELECT COUNT(*) as count
      FROM ai_training_knowledge k
      ${whereClause}
    `, params),
  ])

  return {
    items: items.map(r => ({
      id: r.id,
      knowledgeType: r.knowledge_type,
      title: r.title,
      content: r.content,
      answer: r.answer,
      category: r.category,
      tags: r.tags || [],
      clientId: r.client_id,
      source: r.source,
      sourceFile: r.source_file,
      isApproved: r.is_approved,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      embeddingId: r.embedding_id,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    page,
  }
})
