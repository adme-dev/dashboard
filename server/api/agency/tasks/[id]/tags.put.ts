/**
 * Update Task Tags
 * PUT /api/agency/tasks/:id/tags
 *
 * Replaces all tags on a task with the provided list
 */

import { query, queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateTagsBody {
  tagIds: string[]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const body = await readBody<UpdateTagsBody>(event)

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!Array.isArray(body.tagIds)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'tagIds must be an array'
    })
  }

  // Verify task exists
  const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found'
    })
  }

  // Verify all tags exist
  if (body.tagIds.length > 0) {
    const existingTags = await queryRows(
      'SELECT id FROM global_tags WHERE id = ANY($1)',
      [body.tagIds]
    )
    if (existingTags.length !== body.tagIds.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more tags not found'
      })
    }
  }

  await transaction(async (client) => {
    // Remove existing tags
    await client.query('DELETE FROM task_tags WHERE task_id = $1', [taskId])

    // Add new tags
    for (const tagId of body.tagIds) {
      await client.query(
        'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, tagId]
      )
    }

    // Log activity
    await client.query(`
      INSERT INTO task_activities (task_id, user_id, activity_type, new_value, content)
      VALUES ($1, $2, 'label_change', $3, 'Updated tags')
    `, [taskId, user.id, JSON.stringify(body.tagIds)])
  })

  // Return updated tags
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
