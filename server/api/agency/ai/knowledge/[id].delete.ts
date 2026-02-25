import { queryOne, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { deleteVector } from '~~/server/utils/aiVectorize'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article ID is required' })
  }

  const article = await queryOne<any>(`
    SELECT id, embedding_id FROM ai_knowledge_articles WHERE id = $1
  `, [id])

  if (!article) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  }

  // Delete the vector if it exists
  if (article.embedding_id) {
    deleteVector(article.embedding_id).catch(err => {
      console.error('[knowledge] Vector deletion failed:', err)
    })
  }

  // Delete embeddings log entry
  await execute(`
    DELETE FROM ai_embeddings_log WHERE entity_type = 'knowledge_article' AND entity_id = $1
  `, [id])

  // Delete the article
  await execute(`DELETE FROM ai_knowledge_articles WHERE id = $1`, [id])

  return { success: true }
})
