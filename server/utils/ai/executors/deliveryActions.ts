import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * Executors for the delivery write tools (assign_task / propose_status_change / propose_brief_convert).
 * Each runs the real mutation on a confirmed proposal via the existing internal endpoint, forwarding the
 * caller's headers so the endpoint's own auth re-runs as the real user. The POST/PATCH is injected for
 * unit-testing (default uses Nitro's global $fetch — resolves internal relative routes on CF, #129).
 */

export type Patcher = (url: string, body: any, ctx: ToolContext) => Promise<any>
const defaultPatch: Patcher = (url, body, ctx) => $fetch(url, { method: 'PATCH', body, headers: ctx.event.headers as any })
const defaultPost: Patcher = (url, body, ctx) => $fetch(url, { method: 'POST', body, headers: ctx.event.headers as any })

export function makeAssignTaskExecutor(patch: Patcher = defaultPatch): ActionExecutor {
  return {
    toolName: 'assign_task',
    label: 'task assignment',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const res = await patch(`/api/agency/tasks/${payload.taskId}/assignee`, { assigneeId: payload.assigneeId }, ctx)
      const id = res?.id ?? payload.taskId
      return { resultRef: String(id), summary: `✅ Assigned “${payload.taskTitle}” to ${payload.assigneeName}.` }
    },
  }
}

export function makeStatusChangeExecutor(patch: Patcher = defaultPatch): ActionExecutor {
  return {
    toolName: 'propose_status_change',
    label: 'status change',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const res = await patch(`/api/agency/tasks/${payload.taskId}/status`, { statusId: payload.statusId }, ctx)
      const id = res?.id ?? payload.taskId
      return { resultRef: String(id), summary: `✅ Moved “${payload.taskTitle}” to ${payload.statusName}.` }
    },
  }
}

export function makeBriefConvertExecutor(post: Patcher = defaultPost): ActionExecutor {
  return {
    toolName: 'propose_brief_convert',
    label: 'brief conversion',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const res = await post(`/api/agency/briefs/${payload.briefId}/convert`, payload.projectName ? { projectName: payload.projectName } : {}, ctx)
      const projectId = res?.project?.id
      if (!projectId) throw new Error('brief convert returned no project id')
      const n = typeof res?.tasksCreated === 'number' ? res.tasksCreated : 0
      return { resultRef: String(projectId), summary: `✅ Converted “${payload.briefTitle}” into project “${res.project.name}”${n ? ` with ${n} task${n === 1 ? '' : 's'}` : ''}.` }
    },
  }
}

export const assignTaskExecutor: ActionExecutor = makeAssignTaskExecutor()
export const statusChangeExecutor: ActionExecutor = makeStatusChangeExecutor()
export const briefConvertExecutor: ActionExecutor = makeBriefConvertExecutor()
