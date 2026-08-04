/**
 * Execute a confirmed AI-proposed action (Option B, spec §8).
 *
 * The model only ever PROPOSED the action (a row in ai_pending_actions). This endpoint is the
 * human-in-the-loop gate: it re-checks permission + conversation ownership server-side, atomically
 * claims the proposal (idempotent, expiry- and owner-guarded), and executes the real mutation via
 * the existing task-create endpoint. The client supplies ONLY a proposalId — never the payload —
 * so resolved fields cannot be tampered with after proposal.
 */

// Dispatch is generic (Phase-0 WS-B): the confirmed proposal's tool_name selects an ActionExecutor
// from the registry, which owns the real mutation (create_task today; budget changes etc. later).
// Executors use Nitro's global $fetch internally so internal relative routes resolve on the CF runtime.
import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { executeRegisteredPendingAction, type PendingRow } from '~~/server/utils/ai/pendingActions'
import { getExecutor } from '~~/server/utils/ai/executors'
import { recordAudit } from '~~/server/utils/ai/audit'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const conversationId = getRouterParam(event, 'id')
  const body = await readBody<{ proposalId?: string, richConfirmAck?: boolean }>(event)
  const proposalId = body?.proposalId

  if (!conversationId || !proposalId) {
    throw createError({ statusCode: 400, statusMessage: 'conversationId and proposalId are required' })
  }

  // Verify the caller owns this conversation (mirrors messages.post.ts).
  const conv = await queryOne(
    `SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2 AND is_archived = false`,
    [conversationId, user.id],
  )
  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const ctx: ToolContext = { userId: user.id, userRole: user.role, conversationId, event }
  const result = await executeRegisteredPendingAction({
    proposalId,
    ctx,
    richConfirmAck: body?.richConfirmAck
  }, {
    peek: async (id, userId) => await queryOne<{ tool_name: string, source: string }>(
      `SELECT tool_name, source FROM ai_pending_actions
        WHERE id = $1 AND conversation_id = $2 AND user_id = $3
          AND source = 'chat' AND god_mode_execution_key IS NULL
          AND status = 'proposed' AND expires_at > NOW()`,
      [id, conversationId, userId]
    ),
    claim: async (id, userId) => {
      return await queryOne<PendingRow>(
        `UPDATE ai_pending_actions
           SET status = 'executed', confirmed_by = $1, executed_at = NOW()
         WHERE id = $2 AND conversation_id = $3 AND user_id = $1
           AND source = 'chat' AND god_mode_execution_key IS NULL
           AND status = 'proposed' AND expires_at > NOW()
        RETURNING id, status, tool_name, resolved_payload, user_id, expires_at`,
        [userId, id, conversationId],
      )
    },
    markExecuted: async (id, resultRef) => {
      await execute(`UPDATE ai_pending_actions SET result_ref = $1 WHERE id = $2`, [resultRef, id])
    },
    revertToProposed: async (id) => {
      await execute(
        `UPDATE ai_pending_actions SET status = 'proposed', confirmed_by = NULL, executed_at = NULL WHERE id = $1`,
        [id],
      )
    },
    getExecutor,
    recordAudit
  })

  if ('error' in result) {
    return result.requiresRichConfirm === true
      ? { ok: false, requiresRichConfirm: true, error: result.error }
      : { ok: false, error: result.error }
  }

  const resultRef = result.resultRef
  // Post the executor's confirmation summary into the thread so the action is visible in history.
  if (result.summary) {
    await execute(
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [conversationId, result.summary],
    ).catch(() => { /* non-critical: the action executed regardless */ })
  }

  // `taskId` kept for backward-compatible clients; `resultRef` is the generic alias.
  return { ok: true, taskId: resultRef, resultRef }
})
