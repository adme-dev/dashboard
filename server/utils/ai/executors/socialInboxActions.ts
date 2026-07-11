import { getRequestHeaders } from 'h3'
import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'
import {
  recordSocialInboxNativeLinkEvent,
  updateSocialInboxNativeLinks
} from '~~/server/utils/socialInbox/nativeLinks'
import { queryOne } from '~~/server/utils/db'

type QueryOne = <T = unknown>(sql: string, params?: unknown[]) => Promise<T | null>

const db = {
  queryOne: (<T = unknown>(sql: string, params?: unknown[]) => queryOne<T>(sql, params)) as QueryOne
}

export type SocialCaseTaskPoster = (
  body: {
    departmentId: string
    projectId: string
    title: string
    description?: string
    priority?: string
    taskType?: string
    reporterId: string
  },
  ctx: ToolContext
) => Promise<{ id: string }>

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>

const defaultPostTask: SocialCaseTaskPoster = (body, ctx) =>
  internalFetch<{ id: string }>('/api/agency/tasks', {
    method: 'POST',
    body,
    headers: getRequestHeaders(ctx.event)
  })

async function linkTask(payload: Record<string, unknown>, ctx: ToolContext): Promise<ExecutorResult> {
  const conversationId = String(payload.socialConversationId || '')
  const clientId = String(payload.clientId || '')
  const taskId = String(payload.taskId || '')
  if (!conversationId || !clientId || !taskId) throw new Error('Missing social inbox link payload')

  const updated = await updateSocialInboxNativeLinks(db, conversationId, { linked_task_id: taskId }, ctx.userId)
  if (!updated) throw new Error('Conversation not found')
  await recordSocialInboxNativeLinkEvent(db, conversationId, clientId, { linked_task_id: taskId }, ctx.userId)

  return {
    resultRef: taskId,
    summary: `Linked social conversation to task "${String(payload.taskTitle || taskId)}".`
  }
}

export function makeCreateSocialCaseTaskExecutor(postTask: SocialCaseTaskPoster = defaultPostTask): ActionExecutor {
  return {
    toolName: 'create_social_case_task',
    label: 'social case task',
    riskTier: 'confirm',
    async execute(payload: Record<string, unknown>, ctx: ToolContext): Promise<ExecutorResult> {
      const conversationId = String(payload.socialConversationId || '')
      const clientId = String(payload.clientId || '')
      const departmentId = String(payload.departmentId || '')
      const projectId = String(payload.projectId || '')
      const title = String(payload.title || '').trim()
      if (!conversationId || !clientId || !departmentId || !projectId || !title) {
        throw new Error('Missing social case task payload')
      }

      const created = await postTask({
        departmentId,
        projectId,
        title,
        description: String(payload.description || '').trim() || undefined,
        priority: String(payload.priority || 'medium'),
        taskType: 'task',
        reporterId: ctx.userId
      }, ctx)

      await linkTask({
        socialConversationId: conversationId,
        clientId,
        taskId: created.id,
        taskTitle: title
      }, ctx)

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
  execute: linkTask
}

export const createSocialCaseTaskExecutor: ActionExecutor = makeCreateSocialCaseTaskExecutor()
