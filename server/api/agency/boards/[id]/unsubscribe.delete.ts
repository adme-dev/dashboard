/**
 * Unsubscribe from a board, item, or column
 */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const itemId = (query.itemId as string) || null
  const columnId = (query.columnId as string) || null

  await execute(`
    DELETE FROM board_subscriptions
    WHERE user_id = $1
      AND board_id = $2
      AND item_id IS NOT DISTINCT FROM $3
      AND column_id IS NOT DISTINCT FROM $4
  `, [user.id, boardId, itemId, columnId])

  return { success: true }
})
