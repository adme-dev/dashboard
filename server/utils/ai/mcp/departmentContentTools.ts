import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentContentContracts, DEPARTMENT_CONTENT_WRITE_NAMES, type DepartmentContentToolName } from '../marketing/departmentContentSchemas'

const DESCRIPTIONS: Record<DepartmentContentToolName, string> = {
  marketing_list_content_assets: 'List an entitled active client\'s Search Authority guides with workflow status, current version and latest publication. Stored data only; requires the client\'s Search Authority entitlement.',
  marketing_get_content_asset: 'Read one Search Authority guide: versions with their contentHash, the current body, claims and evidence, source interviews, review decisions and publications. Use versionId + contentHash for submit, review and publish.',
  marketing_create_content_asset: 'Create a governed Search Authority guide on the client\'s site from a source interview that actually took place and that you were given, with the interviewee\'s consent. Never invent an interviewee, summary or date. Creates a draft with no version; nothing is published.',
  marketing_create_content_version: 'Save a new append-only draft version: body, excerpt, disclaimer, schema type, the guide\'s recorded source interviews and every factual claim with its real evidence reference. Requires the current version you read. Returns versionId and contentHash; resets the guide to draft.',
  marketing_submit_content_version: 'Submit the guide\'s exact current draft or rejected version for independent review after acknowledgement. The contentHash must match what you read.',
  marketing_review_content_version: 'Approve or reject a submitted version with a rationale, as an independent marketing manager or admin who neither wrote nor submitted it. Binds the exact version and contentHash. Approval does not publish.',
  marketing_publish_content_version: 'Publish the exact independently approved current version to the client\'s verified content hostname after acknowledgement. Uses the same publication service as the application; an interrupted publication is held for reconciliation and must not be retried blindly.'
}

export const departmentContentTools: AiTool<unknown>[] = (Object.keys(departmentContentContracts) as DepartmentContentToolName[]).map((name) => {
  const mutates = (DEPARTMENT_CONTENT_WRITE_NAMES as readonly string[]).includes(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentContentContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    ...(name === 'marketing_publish_content_version' ? { riskTier: 'rich_confirm' as const } : {}),
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentContentTool(name, args, ctx)
  }
})

export async function executeDepartmentContentTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentContentTools.some(tool => tool.name === name)) return fail('Unknown department content operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentContentOperation } = await import('../marketing/departmentContentOperations')
  return runDepartmentContentOperation(name, args, ctx, key, digest)
}
