/**
 * PATCH /api/chat/board-feeds/:boardId/:feedId
 * Update a board chat feed — toggle active, change event types.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const feedId = getRouterParam(event, 'feedId')
  if (!feedId) {
    throw createError({ statusCode: 400, statusMessage: 'Feed ID is required' })
  }

  const body = await readBody(event)
  const updates: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.eventTypes !== undefined) {
    updates.push(`event_types = $${idx++}`)
    values.push(body.eventTypes)
  }

  if (body.isActive !== undefined) {
    updates.push(`is_active = $${idx++}`)
    values.push(body.isActive)
  }

  if (updates.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No updates provided' })
  }

  updates.push(`updated_at = NOW()`)
  values.push(feedId)

  const feed = await queryOne(`
    UPDATE chat_board_feed_settings
    SET ${updates.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, values)

  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  return feed
})
