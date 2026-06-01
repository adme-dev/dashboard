// server/utils/socialInbox/workflow.ts
// Ties SLA-stamping + auto-assignment into the ingestion path. Called after a genuinely-new inbound
// is recorded (from the poll cron + the webhook). DB + notify injected for testability.
import { applySlaOnInbound } from './sla'
import { autoAssignConversation } from './assignment'

export interface WorkflowDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}
export interface WorkflowDeps {
  notifyAssigned(userId: string, conversationId: string, clientId: string): Promise<void>
}

/** Stamp SLA + auto-assign for a freshly-recorded inbound conversation. Best-effort, never throws fatally. */
export async function onInboundRecorded(
  db: WorkflowDb, deps: WorkflowDeps,
  ctx: { conversationId: string; clientId: string; channelType: string },
): Promise<void> {
  try { await applySlaOnInbound(db, ctx.conversationId, ctx.clientId, ctx.channelType, new Date()) }
  catch (e: any) { console.error('workflow.sla.error', { id: ctx.conversationId, error: String(e?.message ?? e) }) }

  try {
    const assignee = await autoAssignConversation(db, ctx.conversationId, ctx.clientId)
    if (assignee) await deps.notifyAssigned(assignee, ctx.conversationId, ctx.clientId)
  } catch (e: any) { console.error('workflow.assign.error', { id: ctx.conversationId, error: String(e?.message ?? e) }) }
}
