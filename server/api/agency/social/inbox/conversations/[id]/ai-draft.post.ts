import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { generateReplyDraft } from '~~/server/utils/socialInbox/aiDraft'
import type { AutomationContext } from '~~/server/utils/socialInbox/automationTypes'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

interface DraftResult { reply: string, confidence: number, risk: boolean }

/**
 * POST /api/agency/social/inbox/conversations/:id/ai-draft
 * On-demand AI reply suggestion for the composer. Human action, never auto-sends — so it is
 * intentionally NOT behind SOCIAL_AUTOMATION_ENABLED. Optional body { brandPrompt? }.
 *
 * God mode: external-ledger family (model inference); a replayed owner attempt returns the
 * stored draft instead of re-running the model.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  return await executeSocialInboxExternalMutation<DraftResult>(event, 'ai-draft', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult

    const conv = await queryOne<any>(
      `SELECT id, client_id, platform, channel_type, rating FROM social_conversations WHERE id = $1`, [id])
    if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

    const inbound = await queryOne<any>(
      `SELECT id, content, author_name FROM social_messages
         WHERE conversation_id = $1 AND direction = 'in'
         ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [id])
    if (!inbound) throw createError({ statusCode: 400, statusMessage: 'no inbound message to reply to' })

    const ctx: AutomationContext = {
      conversationId: id, clientId: conv.client_id, platform: conv.platform, channelType: conv.channel_type,
      rating: conv.rating ?? null, inboundMessageId: inbound.id, inboundContent: inbound.content ?? '',
      participantName: inbound.author_name ?? null, now: new Date(),
    }
    const draft = await generateReplyDraft(ctx, String(body?.brandPrompt ?? ''))
    await run.markDispatched()
    return { reply: draft.reply, confidence: draft.confidence, risk: draft.risk }
  })
})
