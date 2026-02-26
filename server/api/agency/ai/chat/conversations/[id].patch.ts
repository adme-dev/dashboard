import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const MAX_PINNED = 25

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  const body = await readBody(event)

  // --- Pin/unpin ---
  if (typeof body?.isPinned === 'boolean') {
    if (body.isPinned) {
      // Enforce pin limit
      const countRow = await queryOne(`
        SELECT COUNT(*)::int as cnt
        FROM ai_conversations
        WHERE user_id = $1 AND is_pinned = true AND is_archived = false
      `, [user.id])

      if (countRow && countRow.cnt >= MAX_PINNED) {
        throw createError({
          statusCode: 400,
          statusMessage: `You can pin up to ${MAX_PINNED} conversations. Unpin one first.`,
        })
      }
    }

    const row = await queryOne(`
      UPDATE ai_conversations
      SET is_pinned = $1,
          pinned_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
          updated_at = NOW()
      WHERE id = $2 AND user_id = $3 AND is_archived = false
      RETURNING id, is_pinned, pinned_at, updated_at
    `, [body.isPinned, id, user.id])

    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }

    return {
      id: row.id,
      isPinned: row.is_pinned,
      pinnedAt: row.pinned_at,
      updatedAt: row.updated_at,
    }
  }

  // --- Rename ---
  const title = body?.title?.trim()

  if (!title || title.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Title required (max 200 characters)' })
  }

  const row = await queryOne(`
    UPDATE ai_conversations
    SET title = $1, updated_at = NOW()
    WHERE id = $2 AND user_id = $3 AND is_archived = false
    RETURNING id, title, updated_at
  `, [title, id, user.id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  return { id: row.id, title: row.title, updatedAt: row.updated_at }
})
