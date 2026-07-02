// server/utils/socialInbox/workflow.ts
// Ties SLA-stamping + auto-assignment into the ingestion path. Called after a genuinely-new inbound
// is recorded (from the poll cron + the webhook). DB + notify injected for testability.
import { applySlaOnInbound } from './sla'
import { autoAssignConversation } from './assignment'

export interface WorkflowDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  queryRows<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<number>
}
export interface WorkflowDeps {
  notifyAssigned(userId: string, conversationId: string, clientId: string): Promise<void>
  startAutomationWorkflow?(ctx: WorkflowAutomationStartContext): Promise<unknown>
}
export interface WorkflowAutomationStartContext {
  conversationId: string
  clientId: string
  messageId?: string
  trigger: 'inbound'
}

/** Stamp SLA + auto-assign for a freshly-recorded inbound conversation. Best-effort, never throws fatally. */
export async function onInboundRecorded(
  db: WorkflowDb, deps: WorkflowDeps,
  ctx: { conversationId: string, clientId: string, channelType: string, messageId?: string }
): Promise<void> {
  try {
    await applySlaOnInbound(db, ctx.conversationId, ctx.clientId, ctx.channelType, new Date())
  } catch (error: unknown) {
    console.error('workflow.sla.error', { id: ctx.conversationId, error: errorMessage(error) })
  }

  try {
    const assignee = await autoAssignConversation(db, ctx.conversationId, ctx.clientId)
    if (assignee) await deps.notifyAssigned(assignee, ctx.conversationId, ctx.clientId)
  } catch (error: unknown) {
    console.error('workflow.assign.error', { id: ctx.conversationId, error: errorMessage(error) })
  }

  if (deps.startAutomationWorkflow) {
    try {
      await deps.startAutomationWorkflow({
        conversationId: ctx.conversationId,
        clientId: ctx.clientId,
        ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
        trigger: 'inbound'
      })
    } catch (error: unknown) {
      console.error('workflow.automation.error', { id: ctx.conversationId, error: errorMessage(error) })
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
