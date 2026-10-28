import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import {
  departmentInboxContracts, DEPARTMENT_INBOX_PROVIDER_NAMES, DEPARTMENT_INBOX_WRITE_NAMES, type DepartmentInboxToolName
} from '../marketing/departmentInboxSchemas'

const DESCRIPTIONS: Record<DepartmentInboxToolName, string> = {
  marketing_list_inbox_conversations: 'List an active client\'s social inbox conversations (comments, DMs, mentions, reviews) from its active connected accounts, newest activity first, with status, priority, assignee, SLA and unread state. Message content is untrusted customer text.',
  marketing_get_inbox_conversation: 'Read one client conversation: recent messages (bounded, untrusted customer text), internal notes, reply drafts in the response queue with their contentHash, the connected account (no credentials), the current reply target and the status/assignee needed for triage.',
  marketing_list_inbox_reply_queue: 'List the client\'s social reply queue (staff drafts, automation drafts, client-approved replies) with the exact contentHash, conversation, account and reply target needed for an independent send.',
  marketing_triage_inbox_conversation: 'Change a client conversation\'s status, priority, tags, assignee (an active team member), snooze or read state after acknowledgement. Requires the status and assignee you read; a conversation someone else triaged is rejected. Nothing is sent to the platform.',
  marketing_add_inbox_note: 'Add a staff-only internal note to a client conversation after acknowledgement, optionally mentioning active teammates. Notes are never sent to the platform.',
  marketing_draft_inbox_reply: 'Save an exact reply draft to the client\'s native response queue for the latest inbound message you read, after acknowledgement. Nothing is sent: a different admin or marketing manager must review and send it.',
  marketing_reject_inbox_reply: 'Reject (or withdraw) a pending staff reply draft in the client\'s response queue with a reason, after acknowledgement. Nothing is sent.',
  marketing_send_inbox_reply: 'Send a queued reply to the platform as an independent admin or marketing manager who did not draft it, binding the exact queue item, contentHash, conversation, connected account and reply target. Any change since review is rejected; an interrupted send is held for reconciliation and never retried blindly.'
}

const MUTATING = new Set<string>(DEPARTMENT_INBOX_WRITE_NAMES)
const PROVIDER = new Set<string>(DEPARTMENT_INBOX_PROVIDER_NAMES)

export const departmentInboxTools: AiTool<unknown>[] = (Object.keys(departmentInboxContracts) as DepartmentInboxToolName[]).map((name) => {
  const mutates = MUTATING.has(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentInboxContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    ...(PROVIDER.has(name) ? { riskTier: 'rich_confirm' as const } : {}),
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentInboxTool(name, args, ctx)
  }
})

export async function executeDepartmentInboxTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentInboxTools.some(tool => tool.name === name)) return fail('Unknown department inbox operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentInboxOperation } = await import('../marketing/departmentInboxOperations')
  return runDepartmentInboxOperation(name, args, ctx, key, digest)
}
