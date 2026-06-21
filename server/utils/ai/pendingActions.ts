import { queryOne } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { ok, fail, type ToolContext, type ToolResult } from './toolContext'

/**
 * Option B (spec §8): the model only PROPOSES a write. proposeAction() persists a server-issued,
 * expiring `ai_pending_actions` row; the separate confirm endpoint calls executeProposal() on a
 * human click. The model can never write directly.
 */

export interface PendingRow {
  id: string
  status: string
  tool_name: string
  resolved_payload: any
  user_id: string
  expires_at: string
}

/**
 * Throw this from the mutation slot for a non-retryable failure (e.g. no executor registered).
 * executeProposal will NOT revert the claimed row, so the proposal reaches a terminal state instead
 * of becoming infinitely re-confirmable.
 */
export function terminalError(message: string): Error {
  return Object.assign(new Error(message), { terminal: true as const })
}

/**
 * The DB/side-effect surface executeProposal depends on — injected so the logic is unit-testable
 * and so the event-bound wiring (atomic SQL claim, task-create via the real endpoint) lives in the
 * confirm endpoint, not here.
 */
export interface PendingActionDb {
  /**
   * ATOMICALLY claim the proposal: UPDATE ... SET status='executed' WHERE id=$ AND status='proposed'
   * AND expires_at > NOW() AND user_id=$ RETURNING *. Returns null when already handled / expired /
   * not the caller's — this is what makes execution idempotent and tamper-resistant.
   */
  claim(id: string, userId: string): Promise<PendingRow | null>
  /** Execute the actual mutation (the real task-create path). */
  createTask(payload: any, ctx: ToolContext): Promise<{ id: string }>
  markExecuted(id: string, resultRef: string): Promise<void>
  /** Compensating update if the mutation fails after a successful claim. */
  revertToProposed?(id: string): Promise<void>
}

/** Persist a proposed action. Returns the proposal id surfaced to the confirmation card. */
export async function proposeAction(
  ctx: ToolContext,
  conversationId: string,
  toolName: string,
  resolvedPayload: unknown,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ai_pending_actions (conversation_id, user_id, tool_name, resolved_payload, status)
     VALUES ($1, $2, $3, $4, 'proposed')
     RETURNING id`,
    [conversationId, ctx.userId, toolName, JSON.stringify(resolvedPayload)],
  )
  if (!row) throw new Error('Failed to persist proposed action')
  return row.id
}

/** Shape surfaced to the chat UI so a still-open proposal can be rehydrated after a page reload. */
export interface OpenProposal {
  proposalId: string
  toolName: string
  resolved: unknown
}

/**
 * Look up the most recent still-actionable proposal for a conversation so the confirm card can be
 * re-shown after a reload (the proposal otherwise lives only in the in-memory message returned by
 * the send call). `query` is injected — the endpoint supplies the real SQL (status = 'proposed'
 * AND expires_at > NOW(), most recent first); unit tests supply a stub. Fail-safe: any error (e.g.
 * the table absent in a pre-migration env) yields null so conversation loading never breaks.
 */
export async function loadOpenProposal(
  conversationId: string,
  userId: string,
  query: (conversationId: string, userId: string) => Promise<{ id: string, tool_name: string, resolved_payload: unknown } | null>,
): Promise<OpenProposal | null> {
  try {
    const row = await query(conversationId, userId)
    if (!row) return null
    return { proposalId: row.id, toolName: row.tool_name, resolved: row.resolved_payload }
  } catch {
    return null
  }
}

/**
 * Execute a confirmed proposal. Idempotent: a second confirm claims nothing and returns an error.
 * Re-checks write access server-side (defense in depth) before the atomic claim.
 */
export async function executeProposal(id: string, ctx: ToolContext, db: PendingActionDb): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) {
    return fail('You do not have permission to perform this action.')
  }
  const row = await db.claim(id, ctx.userId)
  if (!row) {
    return fail('This action was already handled, has expired, or is not yours to confirm.')
  }

  // Only the MUTATION failing may roll back (so the user can retry). A failure in post-create
  // bookkeeping must NOT revert — the task already exists and reverting would let a retry create
  // a duplicate. The atomic claim already marked the row executed, so bookkeeping failure is safe.
  let created: { id: string }
  try {
    created = await db.createTask(row.resolved_payload, ctx)
  } catch (err) {
    // A TERMINAL error (e.g. no executor registered for this tool_name — a rolled-back/renamed tool)
    // must NOT revert: reverting returns the row to 'proposed' and the card re-shows, leaving it
    // infinitely re-confirmable with the same error. Leaving it 'executed' (already claimed) is the
    // correct terminal state. Only a genuine mutation failure reverts so the user can retry.
    const terminal = !!(err as { terminal?: boolean } | null)?.terminal
    if (db.revertToProposed && !terminal) await db.revertToProposed(id)
    return fail(terminal
      ? 'This action can no longer be completed and has been dismissed.'
      : 'Could not complete the action — the task was not created. Please try again.')
  }

  try {
    await db.markExecuted(id, created.id)
  } catch {
    // Non-critical: the task was created and the row is already 'executed'. Log-and-continue.
    console.error(`[pendingActions] markExecuted failed for ${id} (task ${created.id} created)`)
  }
  return ok({ taskId: created.id })
}
