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
  try {
    const created = await db.createTask(row.resolved_payload, ctx)
    await db.markExecuted(id, created.id)
    return ok({ taskId: created.id })
  } catch {
    if (db.revertToProposed) await db.revertToProposed(id)
    return fail('Could not complete the action — the task was not created. Please try again.')
  }
}
