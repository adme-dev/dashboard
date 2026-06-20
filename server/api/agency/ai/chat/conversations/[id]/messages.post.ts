import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { processUserMessage } from '~~/server/utils/aiChatEngine'

const RATE_LIMIT_MAX_MESSAGES = 12
const ALLOWED_ENTITY_TYPES = new Set(['task', 'client', 'project', 'brief'])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  const body = await readBody(event)
  const content = body?.content?.trim()

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Message content required' })
  }

  if (content.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Message too long (max 10,000 characters)' })
  }

  // Rate limit: max messages per minute across all conversations
  const rateCheck = await queryOne(`
    SELECT COUNT(*)::int as cnt
    FROM ai_messages m
    JOIN ai_conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1
      AND m.role = 'user'
      AND m.created_at > NOW() - INTERVAL '60 seconds'
  `, [user.id])

  if (rateCheck && rateCheck.cnt >= RATE_LIMIT_MAX_MESSAGES) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many messages. Please wait a moment before sending another.',
    })
  }

  // Verify ownership
  const conv = await queryOne(`
    SELECT id FROM ai_conversations
    WHERE id = $1 AND user_id = $2 AND is_archived = false
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  // Optional: explicit entity references from @mention
  const mentionedEntities: Array<{ type: string; id: string }> = Array.isArray(body?.mentionedEntities)
    ? body.mentionedEntities.filter((e: any) => e?.type && e?.id && ALLOWED_ENTITY_TYPES.has(e.type)).slice(0, 10)
    : []

  // Optional: caller can supply the board the conversation is anchored to
  // so codebase context is scoped to that board's connected repo.
  const boardId = typeof body?.boardId === 'string' ? body.boardId : undefined

  // Optional: named persona key (Slice 1.5). Unknown/absent → generalist (validated server-side).
  const persona = typeof body?.persona === 'string' ? body.persona : undefined

  // Optional: virtual office room context (Mode A) — the docked co-pilot supplies the room it's in so
  // the engine can enrich the prompt with who's present / the live meeting / transcript tail. Tenant
  // isolation is enforced server-side (membership gate in resolveRoomContext); these are hints only.
  const room = body?.room && typeof body.room.officeId === 'string'
    ? {
        officeId: body.room.officeId,
        meetingId: typeof body.room.meetingId === 'string' ? body.room.meetingId : undefined,
        presentUserIds: Array.isArray(body.room.presentUserIds)
          ? body.room.presentUserIds.filter((x: any) => typeof x === 'string').slice(0, 50)
          : undefined,
        transcriptTail: typeof body.room.transcriptTail === 'string' ? body.room.transcriptTail.slice(-4000) : undefined,
      }
    : undefined

  try {
    const result = await processUserMessage(id, user.id, user.role, content, event, mentionedEntities, boardId, persona, room)
    return result
  } catch (err: any) {
    console.error('Failed to process AI message:', err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process message',
    })
  }
})
