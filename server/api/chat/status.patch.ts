/**
 * PATCH /api/chat/status
 * Set current user's chat presence status.
 */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const validStatuses = ['online', 'away', 'dnd', 'offline']
  const { status, customText } = body

  if (!status || !validStatuses.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid status required: online, away, dnd, offline' })
  }

  if (customText && typeof customText === 'string' && customText.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Custom text must be 100 characters or less' })
  }

  await execute(`
    INSERT INTO user_chat_status (user_id, status, custom_text, last_seen_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      status = EXCLUDED.status,
      custom_text = EXCLUDED.custom_text,
      last_seen_at = NOW(),
      updated_at = NOW()
  `, [user.id, status, customText || null])

  return { success: true }
})
