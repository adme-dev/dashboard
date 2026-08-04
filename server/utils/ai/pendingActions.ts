import { queryOne } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { roleHasPermission } from '~~/server/utils/permissions'
import { ok, fail, type ToolContext, type ToolResult } from './toolContext'
import type { AuditInput } from './audit'
import type { ActionExecutor, ExecutionServices } from './executors/types'

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
  conversationId: string | null,
  toolName: string,
  resolvedPayload: unknown,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ai_pending_actions (conversation_id, user_id, tool_name, resolved_payload, status, source)
     VALUES ($1, $2, $3, $4, 'proposed', $5)
     RETURNING id`,
    [conversationId, ctx.userId, toolName, JSON.stringify(resolvedPayload), ctx.source ?? 'chat'],
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

export interface RegisteredPendingActionDependencies {
  peek(id: string, userId: string, conversationId?: string): Promise<{ tool_name: string } | null>
  claim(id: string, userId: string): Promise<PendingRow | null>
  markExecuted(id: string, resultRef: string): Promise<void>
  revertToProposed?(id: string): Promise<void>
  getExecutor(toolName: string): ActionExecutor | null
  recordAudit(input: AuditInput): Promise<void>
}

export interface RegisteredPendingActionRequest {
  proposalId: string
  ctx: ToolContext
  richConfirmAck?: boolean
  executionServices?: ExecutionServices
}

export type RegisteredPendingActionResult =
  | { ok: true, resultRef: string, summary: string, executor: ActionExecutor, claimedRow: PendingRow }
  | { ok: false, error: string, requiresRichConfirm?: boolean }

/**
 * Shared proposal execution used by the ordinary confirmation route. Its default policy is exactly
 * the historical human-confirm path; God-mode direct execution is coordinated separately and never
 * weakens these checks.
 */
export async function executeRegisteredPendingAction(
  request: RegisteredPendingActionRequest,
  dependencies: RegisteredPendingActionDependencies
): Promise<RegisteredPendingActionResult> {
  const peek = await dependencies.peek(
    request.proposalId,
    request.ctx.userId,
    request.ctx.conversationId
  )
  const peekExecutor = peek ? dependencies.getExecutor(peek.tool_name) : null
  if (peekExecutor?.requiredPermission && !roleHasPermission(request.ctx.userRole, peekExecutor.requiredPermission)) {
    return { ok: false, error: 'You do not have permission to confirm this action.' }
  }
  if (peekExecutor?.riskTier === 'rich_confirm' && request.richConfirmAck !== true) {
    return { ok: false, requiresRichConfirm: true, error: 'This change needs explicit confirmation before it can be applied.' }
  }

  let executor: ActionExecutor | null = null
  let claimedRow: PendingRow | null = null
  let summary = ''
  const result = await executeProposal(request.proposalId, request.ctx, {
    claim: async (id, userId) => {
      const claimed = await dependencies.claim(id, userId)
      if (claimed) {
        claimedRow = claimed
        executor = dependencies.getExecutor(claimed.tool_name)
      }
      return claimed
    },
    createTask: async (payload, ctx) => {
      if (!executor) throw terminalError('No executor registered for this action.')
      const executed = await executor.execute(payload, ctx, request.executionServices)
      summary = executed.summary
      return { id: executed.resultRef }
    },
    markExecuted: dependencies.markExecuted,
    revertToProposed: dependencies.revertToProposed
  })
  const resolvedExecutor = executor as ActionExecutor | null

  if (claimedRow) {
    const row = claimedRow as PendingRow
    await dependencies.recordAudit({
      pendingId: row.id,
      userId: row.user_id,
      confirmedBy: request.ctx.userId,
      toolName: row.tool_name,
      riskTier: resolvedExecutor?.riskTier ?? 'confirm',
      clientScope: request.ctx.clientScope ?? null,
      payload: row.resolved_payload,
      resultRef: result.ok ? ((result.data as any)?.taskId ?? null) : null,
      outcome: result.ok ? 'executed' : 'failed'
    })
  }
  if (!result.ok || !claimedRow || !resolvedExecutor) {
    return { ok: false, error: !result.ok && 'error' in result ? result.error : 'Could not complete the action.' }
  }
  return {
    ok: true,
    resultRef: String((result.data as any).taskId),
    summary,
    executor: resolvedExecutor,
    claimedRow
  }
}
