import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import {
  departmentEmailContracts, DEPARTMENT_EMAIL_PROVIDER_NAMES, DEPARTMENT_EMAIL_WRITE_NAMES, type DepartmentEmailToolName
} from '../marketing/departmentEmailSchemas'

const DESCRIPTIONS: Record<DepartmentEmailToolName, string> = {
  marketing_list_email_campaigns: 'List an active client\'s email campaigns with status, subject, sender and delivery counters. Client-owned campaigns only; cursor paginated. Stored data only.',
  marketing_get_email_campaign: 'Read one client email campaign: sender identity, subject, target lists, segment, the editable body document (when small), a text excerpt, recipient queue counts, live send preflight, whether sending is enabled, open send proposals and the revision required for edits and proposals.',
  marketing_list_email_audiences: 'List the client\'s own email lists with mailable subscriber counts (unsubscribed, suppressed and disabled subscribers excluded) and the client\'s saved email templates. Counts only; no subscriber addresses.',
  marketing_get_email_send_proposal: 'Read an email send proposal: the frozen content, audience and recipient hashes, recipient count, sender, review decision, execution progress, and whether the campaign still matches what was approved.',
  marketing_create_email_campaign_draft: 'Create a draft email campaign for the client after acknowledgement, from an Email Studio body document or one of the client\'s templates. Rendered by the application\'s email renderer. Nothing is sent and no recipients are selected.',
  marketing_update_email_campaign_draft: 'Edit a draft campaign\'s name, subject, sender, reply-to, preview text, body document or segment after acknowledgement. Requires the revision you read; any change since then is rejected. Drafts only; edits invalidate earlier send proposals.',
  marketing_set_email_campaign_audience: 'Replace a draft campaign\'s target lists with lists owned by the same client, after acknowledgement and with the revision you read. Does not send or materialize recipients.',
  marketing_propose_email_campaign_send: 'Prepare a send for independent review: builds the campaign\'s recipient queue with the application\'s consent rules (unsubscribed, suppressed, blocklisted and disabled subscribers excluded; segment applied), runs send preflight, and freezes the exact content, audience, recipient set and sender. Sends nothing.',
  marketing_review_email_campaign_send: 'Approve or reject a send proposal as an independent admin or marketing manager who did not request it, binding its freeze revision. The campaign must still match the frozen content, audience and recipients. Approval does not send.',
  marketing_execute_email_campaign_send: 'Send an independently approved campaign to exactly its frozen recipients through the application\'s campaign sender, after acknowledgement, by the requester or reviewer. Requires email sending to be enabled. Large campaigns send in bounded batches; call again with a new request to continue. An interrupted send is held for reconciliation and is never retried blindly.',
  marketing_send_email_campaign_test: 'Send one [TEST] copy of a campaign to your own verified staff email address only, after acknowledgement and with the revision you read. Requires email sending to be enabled; does not change the campaign or its recipients.',
  marketing_pause_email_campaign_send: 'Pause a campaign that is currently sending, after acknowledgement. Already-sent recipients are unaffected; remaining recipients wait until an approved send is continued.',
  marketing_cancel_email_campaign: 'Cancel a draft, scheduled, sending or paused campaign after acknowledgement with the status you read. Remaining unsent recipients are cancelled; sent recipients are unaffected. Cannot be undone.'
}

const MUTATING = new Set<string>(DEPARTMENT_EMAIL_WRITE_NAMES)
const PROVIDER = new Set<string>(DEPARTMENT_EMAIL_PROVIDER_NAMES)

export const departmentEmailTools: AiTool<unknown>[] = (Object.keys(departmentEmailContracts) as DepartmentEmailToolName[]).map((name) => {
  const mutates = MUTATING.has(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentEmailContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    ...(PROVIDER.has(name) ? { riskTier: 'rich_confirm' as const } : {}),
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentEmailTool(name, args, ctx)
  }
})

export async function executeDepartmentEmailTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentEmailTools.some(tool => tool.name === name)) return fail('Unknown department email operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentEmailOperation } = await import('../marketing/departmentEmailOperations')
  return runDepartmentEmailOperation(name, args, ctx, key, digest)
}
