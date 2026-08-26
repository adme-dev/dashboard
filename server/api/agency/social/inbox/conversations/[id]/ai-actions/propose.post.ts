import { requireAuth } from '~~/server/utils/auth'
import {
  proposeSocialInboxAiAction,
  SocialInboxAiActionError,
  type SocialInboxAiActionInput,
  type SocialInboxAiActionProposal
} from '~~/server/utils/socialInbox/aiActions'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxMutation, socialInboxTransactionDb } from '~~/server/utils/socialInbox/godModeMutations'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<SocialInboxAiActionInput>(event)

  try {
    const result = await executeSocialInboxMutation(event, 'ai-action-propose', async (client) => {
      const proposal = await proposeSocialInboxAiAction(socialInboxTransactionDb(client), id, body, String(user.id))
      return { id: proposal.proposalId, proposal, replayed: false }
    }, async (client, ref) => {
      const { rows } = await client.query(
        `SELECT id, tool_name, resolved_payload FROM ai_pending_actions WHERE id = $1`, [ref])
      const row = rows[0] as { id: string, tool_name: SocialInboxAiActionProposal['toolName'], resolved_payload: unknown } | undefined
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
      const resolved = typeof row.resolved_payload === 'string'
        ? JSON.parse(row.resolved_payload) as Record<string, unknown>
        : (row.resolved_payload as Record<string, unknown>) ?? {}
      const proposal: SocialInboxAiActionProposal = { proposalId: row.id, toolName: row.tool_name, resolved }
      return { id: ref, proposal, replayed: true }
    })
    const clientId = String(result.proposal.resolved.clientId || '')
    if (clientId && !result.replayed) {
      emitInboxEvent({ clientId, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
    }
    return { ok: true, proposal: result.proposal }
  } catch (error) {
    if (error instanceof SocialInboxAiActionError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
