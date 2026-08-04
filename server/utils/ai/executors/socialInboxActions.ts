import type { Pool } from '@neondatabase/serverless'

import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutionServices, ExecutorResult } from './types'
import { transaction } from '~~/server/utils/db'
import { autoSubscribeIfEnabledInTransaction } from '~~/server/utils/subscriptions'
import {
  recordSocialInboxNativeLinkEvent,
  updateSocialInboxNativeLinks
} from '~~/server/utils/socialInbox/nativeLinks'

type TransactionDb = Pick<Pool, 'query'>
type TransactionRunner = <T>(callback: (db: TransactionDb) => Promise<T>) => Promise<T>

export interface AtomicSocialCaseServices {
  db?: ExecutionServices['db']
  transaction?: TransactionRunner
}

export type AtomicSocialCaseCreator = (
  payload: Record<string, unknown>,
  ctx: ToolContext,
  services?: AtomicSocialCaseServices
) => Promise<{ id: string }>

function dbAdapter(db: TransactionDb) {
  return {
    queryOne: async <T>(sql: string, params?: unknown[]) =>
      (await db.query(sql, params)).rows[0] as T ?? null
  }
}

/**
 * The task and its native social-conversation link are one mutation boundary. God-mode supplies
 * its ledger transaction; ordinary confirmation opens the same server-owned transaction here.
 */
export async function createAndLinkSocialCaseTask(
  payload: Record<string, unknown>,
  ctx: ToolContext,
  services: AtomicSocialCaseServices = {}
): Promise<{ id: string }> {
  const socialConversationId = String(payload.socialConversationId || '')
  const clientId = String(payload.clientId || '')
  const departmentId = String(payload.departmentId || '')
  const projectId = String(payload.projectId || '')
  const title = String(payload.title || '').trim()
  const description = String(payload.description || '').trim() || null
  const priority = String(payload.priority || 'medium')
  if (!socialConversationId || !clientId || !departmentId || !projectId || !title) {
    throw new Error('Missing social case task payload')
  }

  const execute = async (db: TransactionDb) => {
    const conversation = (await db.query<{ id: string, linked_task_id: string | null }>(
      `SELECT id, linked_task_id
         FROM social_conversations
        WHERE id = $1 AND client_id = $2
        FOR UPDATE`,
      [socialConversationId, clientId]
    )).rows[0]
    if (!conversation) throw new Error('Conversation not found')
    if (conversation.linked_task_id) throw new Error('Conversation already has a linked task')

    const department = (await db.query<{ id: string }>(
      'SELECT id FROM departments WHERE id = $1 AND is_active = TRUE',
      [departmentId]
    )).rows[0]
    if (!department) throw new Error('Department not found')

    const project = (await db.query<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1 AND client_id = $2',
      [projectId, clientId]
    )).rows[0]
    if (!project) throw new Error('Project not found')

    const status = (await db.query<{ id: string }>(
      `SELECT id FROM task_statuses
        WHERE (department_id IS NULL OR department_id = $1) AND is_default = TRUE
        ORDER BY department_id NULLS LAST
        LIMIT 1`,
      [departmentId]
    )).rows[0]
    if (!status) throw new Error('No valid status found for department')

    const task = (await db.query<{ id: string, title: string }>(
      `INSERT INTO tasks (
         department_id, project_id, status_id, title, description, priority, task_type, reporter_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'task', $7)
       RETURNING id, title`,
      [departmentId, projectId, status.id, title, description, priority, ctx.userId]
    )).rows[0]
    if (!task?.id) throw new Error('Task creation failed')

    await db.query(
      `INSERT INTO task_activities (task_id, user_id, activity_type, content)
       VALUES ($1, $2, 'created', $3)`,
      [task.id, ctx.userId, `Created task "${task.title}"`]
    )

    await autoSubscribeIfEnabledInTransaction(db, ctx.userId, departmentId, task.id)

    const updated = await db.query(
      `UPDATE social_conversations
          SET linked_task_id = $3, native_linked_by = $4, native_linked_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND linked_task_id IS NULL
        RETURNING id`,
      [socialConversationId, clientId, task.id, ctx.userId]
    )
    if ((updated.rowCount ?? updated.rows.length) !== 1) throw new Error('Social conversation link failed')

    await db.query(
      `INSERT INTO social_conversation_events
        (conversation_id, client_id, actor_id, event_type, content, metadata)
       VALUES ($1, $2, $3, 'native_link_update', 'Native workflow updated: task linked', $4::jsonb)`,
      [socialConversationId, clientId, ctx.userId, JSON.stringify({ linked_task_id: task.id })]
    )
    return { id: task.id }
  }

  if (services.db) return await execute(services.db)
  return await (services.transaction ?? ((callback) => transaction(callback as any)))(execute)
}

async function linkTask(payload: Record<string, unknown>, ctx: ToolContext, services?: ExecutionServices): Promise<ExecutorResult> {
  const conversationId = String(payload.socialConversationId || '')
  const clientId = String(payload.clientId || '')
  const taskId = String(payload.taskId || '')
  if (!conversationId || !clientId || !taskId) throw new Error('Missing social inbox link payload')

  const run = async (db: TransactionDb) => {
    const adapter = dbAdapter(db)
    const updated = await updateSocialInboxNativeLinks(adapter, conversationId, { linked_task_id: taskId }, ctx.userId)
    if (!updated) throw new Error('Conversation not found')
    await recordSocialInboxNativeLinkEvent(adapter, conversationId, clientId, { linked_task_id: taskId }, ctx.userId)
  }
  if (services?.db) await run(services.db)
  else await transaction(run as any)

  return {
    resultRef: taskId,
    summary: `Linked social conversation to task "${String(payload.taskTitle || taskId)}".`
  }
}

export function makeCreateSocialCaseTaskExecutor(
  createAtomically: AtomicSocialCaseCreator = createAndLinkSocialCaseTask
): ActionExecutor {
  return {
    toolName: 'create_social_case_task',
    label: 'social case task',
    riskTier: 'confirm',
    executionClass: 'local-transactional',
    async execute(payload, ctx, services): Promise<ExecutorResult> {
      const title = String(payload.title || '').trim()
      const created = await createAtomically(payload, ctx, services as AtomicSocialCaseServices | undefined)
      return {
        resultRef: created.id,
        summary: `Created and linked social case task "${title}".`
      }
    }
  }
}

export const linkSocialConversationTaskExecutor: ActionExecutor = {
  toolName: 'link_social_conversation_task',
  label: 'social task link',
  riskTier: 'confirm',
  executionClass: 'local-transactional',
  execute: linkTask
}

export const createSocialCaseTaskExecutor: ActionExecutor = makeCreateSocialCaseTaskExecutor()
