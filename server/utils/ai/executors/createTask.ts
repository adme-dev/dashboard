import type { ToolContext } from '../toolContext'
import { proposalToTaskBody } from '../tools/createTask'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The create_task executor — the existing confirm path, extracted verbatim (behavior-preserving).
 * The actual POST is injected (`post`) so the executor is unit-testable; the default uses Nitro's
 * global $fetch, which resolves the internal relative route on the Cloudflare runtime (see #129 —
 * raw ofetch throws on a relative URL server-side).
 */
export type TaskPoster = (body: ReturnType<typeof proposalToTaskBody>, ctx: ToolContext) => Promise<{ id: string }>

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>

const defaultPoster: TaskPoster = (body, ctx) =>
  internalFetch<{ id: string }>('/api/agency/tasks', { method: 'POST', body, headers: ctx.event.headers as any })

export function makeCreateTaskExecutor(post: TaskPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'create_task',
    label: 'task',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const created = await post(proposalToTaskBody(payload, ctx.userId), ctx)
      const title = payload?.title ?? 'task'
      const assignee = payload?.assigneeName ?? null
      return {
        resultRef: created.id,
        summary: `✅ Created task “${title}”${assignee ? ` for ${assignee}` : ''}.`,
      }
    },
  }
}

export const createTaskExecutor: ActionExecutor = makeCreateTaskExecutor()
