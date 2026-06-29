import type { H3Event } from 'h3'
import { execute, queryOne } from '~~/server/utils/db'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { executeProposal, terminalError, type PendingActionDb, type PendingRow } from '~~/server/utils/ai/pendingActions'
import { getExecutor } from '~~/server/utils/ai/executors'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'
import { recordAudit } from '~~/server/utils/ai/audit'

export interface SocialInboxAiActionDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
}

export type SocialInboxAiActionInput
  = | { type: 'link_task', taskId?: unknown, reason?: unknown }
    | { type: 'create_social_case', departmentId?: unknown, projectId?: unknown, title?: unknown, description?: unknown, reason?: unknown }

export interface SocialInboxAiActionProposal {
  proposalId: string
  toolName: 'link_social_conversation_task' | 'create_social_case_task'
  resolved: Record<string, unknown>
}

export class SocialInboxAiActionError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'SocialInboxAiActionError'
    this.statusCode = statusCode
  }
}

function cleanString(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

async function loadConversation(db: SocialInboxAiActionDb, conversationId: string) {
  const conversation = await db.queryOne<{ id: string, client_id: string }>(
    'SELECT id, client_id FROM social_conversations WHERE id = $1',
    [conversationId]
  )
  if (!conversation) throw new SocialInboxAiActionError(404, 'Conversation not found')
  return conversation
}

async function insertPendingAction(
  db: SocialInboxAiActionDb,
  userId: string,
  toolName: SocialInboxAiActionProposal['toolName'],
  resolved: Record<string, unknown>
): Promise<SocialInboxAiActionProposal> {
  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO ai_pending_actions (conversation_id, user_id, tool_name, resolved_payload, status, source)
     VALUES ($1, $2, $3, $4, 'proposed', $5)
     RETURNING id`,
    [null, userId, toolName, JSON.stringify(resolved), 'social_inbox']
  )
  if (!row) throw new SocialInboxAiActionError(500, 'Failed to create AI proposal')
  return { proposalId: row.id, toolName, resolved }
}

export async function proposeSocialInboxAiAction(
  db: SocialInboxAiActionDb,
  conversationId: string,
  input: SocialInboxAiActionInput,
  userId: string
): Promise<SocialInboxAiActionProposal> {
  const conversation = await loadConversation(db, conversationId)

  if (input.type === 'link_task') {
    const taskId = cleanString(input.taskId, 80)
    if (!taskId) throw new SocialInboxAiActionError(400, 'Task ID required')
    const task = await db.queryOne<{ id: string, title: string, project_name: string | null }>(
      `SELECT t.id, t.title, p.name AS project_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
        WHERE t.id = $1
          AND p.client_id = $2`,
      [taskId, conversation.client_id]
    )
    if (!task) throw new SocialInboxAiActionError(400, 'Invalid task for this conversation')

    const resolved = {
      socialConversationId: conversationId,
      clientId: conversation.client_id,
      taskId: task.id,
      taskTitle: task.title,
      projectName: task.project_name,
      reason: cleanString(input.reason, 500) || 'AI recommended linking this conversation to an existing task.'
    }
    return await insertPendingAction(db, userId, 'link_social_conversation_task', resolved)
  }

  if (input.type === 'create_social_case') {
    const departmentId = cleanString(input.departmentId, 80)
    const projectId = cleanString(input.projectId, 80)
    const title = cleanString(input.title, 160)
    const description = cleanString(input.description, 2000)
    if (!departmentId) throw new SocialInboxAiActionError(400, 'Board required')
    if (!projectId) throw new SocialInboxAiActionError(400, 'Project required')
    if (!title) throw new SocialInboxAiActionError(400, 'Title required')

    const department = await db.queryOne<{ id: string, name: string }>(
      'SELECT id, name FROM departments WHERE id = $1 AND is_active = true',
      [departmentId]
    )
    if (!department) throw new SocialInboxAiActionError(400, 'Invalid board')

    const project = await db.queryOne<{ id: string, name: string }>(
      'SELECT id, name FROM projects WHERE id = $1 AND client_id = $2',
      [projectId, conversation.client_id]
    )
    if (!project) throw new SocialInboxAiActionError(400, 'Invalid project for this conversation')

    const resolved = {
      socialConversationId: conversationId,
      clientId: conversation.client_id,
      departmentId: department.id,
      departmentName: department.name,
      projectId: project.id,
      projectName: project.name,
      title,
      description,
      priority: 'medium',
      reason: cleanString(input.reason, 500) || 'AI recommended creating a native social case task.'
    }
    return await insertPendingAction(db, userId, 'create_social_case_task', resolved)
  }

  throw new SocialInboxAiActionError(400, 'Unsupported action type')
}

export async function confirmSocialInboxAiAction(args: {
  event: H3Event
  conversationId: string
  proposalId: string
  userId: string
  userRole: string
}): Promise<{ ok: boolean, resultRef?: string, clientId?: string | null, error?: string }> {
  let executor: ActionExecutor | null = null
  let claimedRow: PendingRow | null = null
  let summary = ''
  let clientScope: string | null = null

  const ctx: ToolContext = {
    userId: args.userId,
    userRole: args.userRole,
    source: 'social_inbox',
    event: args.event
  }

  const db: PendingActionDb = {
    claim: async (id, userId) => {
      const claimed = await queryOne<PendingRow & { client_id?: string | null }>(
        `UPDATE ai_pending_actions
            SET status = 'executed',
                confirmed_by = $1,
                executed_at = NOW()
          WHERE id = $2
            AND user_id = $1
            AND source = 'social_inbox'
            AND status = 'proposed'
            AND expires_at > NOW()
            AND resolved_payload->>'socialConversationId' = $3
          RETURNING id, status, tool_name, resolved_payload, user_id, expires_at,
                    resolved_payload->>'clientId' AS client_id`,
        [userId, id, args.conversationId]
      )
      if (claimed) {
        claimedRow = claimed
        clientScope = claimed.client_id ?? null
        executor = getExecutor(claimed.tool_name)
      }
      return claimed
    },
    createTask: async (payload, ctx) => {
      if (!executor) throw terminalError('No executor registered for this action.')
      const res = await executor.execute(payload, ctx)
      summary = res.summary
      return { id: res.resultRef }
    },
    markExecuted: async (id, resultRef) => {
      await execute('UPDATE ai_pending_actions SET result_ref = $1 WHERE id = $2', [resultRef, id])
    },
    revertToProposed: async (id) => {
      await execute(
        `UPDATE ai_pending_actions
            SET status = 'proposed',
                confirmed_by = NULL,
                executed_at = NULL
          WHERE id = $1`,
        [id]
      )
    }
  }

  const result = await executeProposal(args.proposalId, ctx, db)

  if (claimedRow) {
    await recordAudit({
      pendingId: claimedRow.id,
      userId: claimedRow.user_id,
      confirmedBy: args.userId,
      toolName: claimedRow.tool_name,
      riskTier: executor?.riskTier ?? 'confirm',
      clientScope,
      payload: claimedRow.resolved_payload,
      resultRef: result.ok ? ((result.data as { taskId?: string })?.taskId ?? null) : null,
      outcome: result.ok ? 'executed' : 'failed'
    })
  }

  if (!result.ok) {
    return { ok: false, clientId: clientScope, error: 'error' in result ? result.error : 'Could not complete the action.' }
  }
  if (summary) {
    await execute(
      `INSERT INTO social_conversation_events
        (conversation_id, client_id, actor_id, event_type, content, metadata)
       VALUES ($1, $2, $3, 'ai_action_confirmed', $4, $5::jsonb)`,
      [
        args.conversationId,
        clientScope,
        args.userId,
        summary,
        JSON.stringify({ proposal_id: args.proposalId, tool_name: claimedRow?.tool_name ?? null })
      ]
    ).catch(() => {})
  }

  const resultRef = (result.data as { taskId?: string })?.taskId
  return { ok: true, resultRef, clientId: clientScope }
}
