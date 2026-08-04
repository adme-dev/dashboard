import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { processUserMessage } from '~~/server/utils/aiChatEngine'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority
} from '~~/server/utils/godMode/authority'
import { recordGodModeBypassedControls } from '~~/server/utils/godMode/featureGate'
import {
  claimGodModeChatSubmission,
  completeGodModeChatSubmission,
  isTransportRetryToken,
  type GodModeChatSubmissionClaim
} from '~~/server/utils/ai/godModeChatSubmission'

const RATE_LIMIT_MAX_MESSAGES = 12
const ALLOWED_ENTITY_TYPES = new Set(['task', 'client', 'project', 'brief'])

interface MessagesRouteDependencies {
  claimSubmission: typeof claimGodModeChatSubmission
  completeSubmission: typeof completeGodModeChatSubmission
  processMessage: typeof processUserMessage
}

const defaultDependencies: MessagesRouteDependencies = {
  claimSubmission: claimGodModeChatSubmission,
  completeSubmission: completeGodModeChatSubmission,
  processMessage: processUserMessage
}

export function createMessagesPostHandler(dependencies: MessagesRouteDependencies = defaultDependencies) {
  return async (event: any) => {
    const user = await requireAuth(event)
    const authority = await resolveGodModeAuthority(event, user.id)
    const godModeActive = isActiveGodModeAuthority(authority, user.id)
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
      if (godModeActive) {
        await recordGodModeBypassedControls(event, ['rate_limit'])
      } else {
        throw createError({
          statusCode: 429,
          statusMessage: 'Too many messages. Please wait a moment before sending another.',
        })
      }
    }

    // Verify ownership
    const conv = await queryOne(`
      SELECT id FROM ai_conversations
      WHERE id = $1 AND user_id = $2 AND is_archived = false
    `, [id, user.id])

    if (!conv) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }

    const mentionedEntities: Array<{ type: string; id: string }> = Array.isArray(body?.mentionedEntities)
      ? body.mentionedEntities.filter((e: any) => e?.type && e?.id && ALLOWED_ENTITY_TYPES.has(e.type)).slice(0, 10)
      : []
    const boardId = typeof body?.boardId === 'string' ? body.boardId : undefined
    const persona = typeof body?.persona === 'string' ? body.persona : undefined
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

    let submission: Extract<GodModeChatSubmissionClaim, { state: 'claimed' }> | null = null
    const transportRetryToken = body?.transportRetryToken
    if (godModeActive) {
      if (!isTransportRetryToken(transportRetryToken)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid transportRetryToken is required' })
      }
      const claim = await dependencies.claimSubmission({
        actorUserId: user.id,
        conversationId: id,
        transportRetryToken,
        content,
        request: { content, mentionedEntities, boardId, persona, room }
      })
      if (claim.state === 'completed') return { ...claim.response, transportRetryToken }
      if (claim.state === 'blocked') {
        throw createError({ statusCode: 409, statusMessage: 'This submission is already being processed' })
      }
      submission = claim
    }

    try {
      const result = await dependencies.processMessage(
        id, user.id, user.role, content, event, mentionedEntities, boardId, persona, room,
        undefined,
        submission ? { userMessageId: submission.userMessageId } : undefined
      )
      if (submission) {
        await dependencies.completeSubmission({
          submissionId: submission.submissionId,
          actorUserId: user.id,
          response: result as unknown as Record<string, unknown>,
          assistantMessageId: result.message?.id
        })
        return { ...result, transportRetryToken }
      }
      return result
    } catch (err: any) {
      console.error('Failed to process AI message:', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to process message' })
    }
  }
}

export default defineEventHandler(createMessagesPostHandler())
