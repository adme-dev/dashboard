/**
 * Get Task Tags
 * GET /api/agency/tasks/:id/tags
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  const tags = await queryRows(`
    SELECT
      gt.id,
      gt.name,
      gt.slug,
      gt.color,
      gt.description,
      gt.usage_count,
      gt.created_at,
      gt.updated_at
    FROM global_tags gt
    JOIN task_tags tt ON gt.id = tt.tag_id
    WHERE tt.task_id = $1
    ORDER BY gt.name
  `, [taskId])

  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
    description: tag.description,
    usageCount: tag.usage_count,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at
  }))
})
