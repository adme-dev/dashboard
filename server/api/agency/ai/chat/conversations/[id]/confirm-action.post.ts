/**
 * Execute a confirmed AI-proposed action (Option B, spec §8).
 *
 * The model only ever PROPOSED the action (a row in ai_pending_actions). This endpoint is the
 * human-in-the-loop gate: it re-checks permission + conversation ownership server-side, atomically
 * claims the proposal (idempotent, expiry- and owner-guarded), and executes the real mutation via
 * the existing task-create endpoint. The client supplies ONLY a proposalId — never the payload —
 * so resolved fields cannot be tampered with after proposal.
 */

// Use Nitro's global $fetch (NOT raw ofetch): it resolves internal relative routes like
// '/api/agency/tasks' on the Cloudflare Workers runtime. Raw ofetch has no origin base for a
// relative URL on the server, so it threw and the task-create silently reverted (Option B).
import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { executeProposal, type PendingActionDb, type PendingRow } from '~~/server/utils/ai/pendingActions'
import { proposalToTaskBody } from '~~/server/utils/ai/tools/createTask'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const conversationId = getRouterParam(event, 'id')
  const body = await readBody<{ proposalId?: string }>(event)
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

  let createdTitle = 'task'
  let createdAssignee: string | null = null

  const db: PendingActionDb = {
    // Atomic claim scoped to this conversation + caller; idempotent + expiry/owner-guarded.
    claim: (id, userId) =>
      queryOne<PendingRow>(
        `UPDATE ai_pending_actions
           SET status = 'executed', confirmed_by = $1, executed_at = NOW()
         WHERE id = $2 AND conversation_id = $3 AND user_id = $1
           AND status = 'proposed' AND expires_at > NOW()
         RETURNING id, status, tool_name, resolved_payload, user_id, expires_at`,
        [userId, id, conversationId],
      ),
    createTask: async (payload) => {
      createdTitle = payload?.title ?? 'task'
      createdAssignee = payload?.assigneeName ?? null
      const created = await $fetch<{ id: string }>('/api/agency/tasks', {
        method: 'POST',
        body: proposalToTaskBody(payload, user.id),
        headers: event.headers as any,
      })
      return { id: created.id }
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
  }

  const ctx: ToolContext = { userId: user.id, userRole: user.role, conversationId, event }
  const result = await executeProposal(proposalId, ctx, db)

  if (!result.ok) {
    return { ok: false, error: 'error' in result ? result.error : 'Could not complete the action.' }
  }

  const taskId = (result.data as any)?.taskId as string
  // Post a confirmation message into the thread so the action is visible in history.
  const content = `✅ Created task “${createdTitle}”${createdAssignee ? ` for ${createdAssignee}` : ''}.`
  await execute(
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
    [conversationId, content],
  ).catch(() => { /* non-critical: the task was created regardless */ })

  return { ok: true, taskId }
})
