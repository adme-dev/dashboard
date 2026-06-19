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
import { executeProposal, terminalError, type PendingActionDb, type PendingRow } from '~~/server/utils/ai/pendingActions'
import { getExecutor, type ActionExecutor } from '~~/server/utils/ai/executors'
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

  // Resolved at claim time from the proposal's tool_name; drives the mutation + thread summary.
  let executor: ActionExecutor | null = null
  let claimedRow: PendingRow | null = null
  let summary = ''

  const db: PendingActionDb = {
    // Atomic claim scoped to this conversation + caller; idempotent + expiry/owner-guarded.
    // We also resolve the executor here, the only point where we have the row's tool_name.
    claim: async (id, userId) => {
      const claimed = await queryOne<PendingRow>(
        `UPDATE ai_pending_actions
           SET status = 'executed', confirmed_by = $1, executed_at = NOW()
         WHERE id = $2 AND conversation_id = $3 AND user_id = $1
           AND status = 'proposed' AND expires_at > NOW()
         RETURNING id, status, tool_name, resolved_payload, user_id, expires_at`,
        [userId, id, conversationId],
      )
      if (claimed) {
        claimedRow = claimed
        executor = getExecutor(claimed.tool_name)
      }
      return claimed
    },
    // The generic mutation slot: delegate to the tool_name's executor. An unknown tool throws,
    // which executeProposal catches and reverts (so the row returns to 'proposed' for retry).
    createTask: async (payload, ctx) => {
      // Terminal (non-retryable): an unknown tool_name must not revert-and-re-offer (would loop forever).
      if (!executor) throw terminalError('No executor registered for this action.')
      const res = await executor.execute(payload, ctx)
      summary = res.summary
      return { id: res.resultRef }
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

  // High-risk gate (review finding #3): a `rich_confirm` executor (e.g. a live ad-budget change) must
  // NOT execute on a plain one-click confirm. Peek the proposal's tool_name (no claim yet) and, if its
  // executor is rich_confirm, require an explicit acknowledgement in the request body. The Phase-2 rich
  // confirm card (current→proposed, %, rollback, counter-model) supplies `richConfirmAck: true`. The
  // claim inside executeProposal stays the atomic, idempotent authority — this is a pre-gate only.
  const peek = await queryOne<{ tool_name: string }>(
    `SELECT tool_name FROM ai_pending_actions
       WHERE id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'proposed' AND expires_at > NOW()`,
    [proposalId, conversationId, user.id],
  )
  if (peek) {
    const peekExecutor = getExecutor(peek.tool_name)
    if (peekExecutor?.riskTier === 'rich_confirm' && body?.richConfirmAck !== true) {
      return { ok: false, requiresRichConfirm: true, error: 'This change needs explicit confirmation before it can be applied.' }
    }
  }

  const result = await executeProposal(proposalId, ctx, db)

  // Audit every attempt we actually CLAIMED (executed or failed-and-reverted). A no-claim outcome
  // (read-only reject / idempotent second click / expired) is not an action, so it is not audited.
  if (claimedRow) {
    const row = claimedRow as PendingRow
    await recordAudit({
      pendingId: row.id,
      userId: row.user_id,
      confirmedBy: user.id,
      toolName: row.tool_name,
      riskTier: executor?.riskTier ?? 'confirm',
      clientScope: ctx.clientScope ?? null,
      payload: row.resolved_payload,
      resultRef: result.ok ? ((result.data as any)?.taskId ?? null) : null,
      outcome: result.ok ? 'executed' : 'failed',
    })
  }

  if (!result.ok) {
    return { ok: false, error: 'error' in result ? result.error : 'Could not complete the action.' }
  }

  const resultRef = (result.data as any)?.taskId as string
  // Post the executor's confirmation summary into the thread so the action is visible in history.
  if (summary) {
    await execute(
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [conversationId, summary],
    ).catch(() => { /* non-critical: the action executed regardless */ })
  }

  // `taskId` kept for backward-compatible clients; `resultRef` is the generic alias.
  return { ok: true, taskId: resultRef, resultRef }
})
