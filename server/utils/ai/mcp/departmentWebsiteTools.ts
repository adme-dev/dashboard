import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentWebsiteContracts, DEPARTMENT_WEBSITE_WRITE_NAMES, type DepartmentWebsiteToolName } from '../marketing/departmentWebsiteSchemas'

const DESCRIPTIONS: Record<DepartmentWebsiteToolName, string> = {
  marketing_list_websites: 'List an active client\'s Page Studio websites in the agency organisation: status, entitlement, editor kind, current version and live release hostnames. Requires the Page Studio VIEW grant. Stored data only.',
  marketing_get_website: 'Read one client website: versions with digest/checkpoint/author, review decisions, release pointers and, for a submitted current version, the exact reviewComparison to bind a review. Requires Page Studio VIEW.',
  marketing_get_website_draft: 'Read the website\'s saved draft with its revision. Studio sites return pages plus reusable form identities (definitionId and placements); Dashboard-document sites return the editable document. Requires Page Studio EDIT.',
  marketing_save_website_draft: 'Save a Dashboard-document website draft after acknowledgement, binding the revision you read. Requires Page Studio EDIT and an active entitlement. Studio-edited sites are refused. Never submits, previews or publishes.',
  marketing_review_website_version: 'Approve, reject or return a submitted website version with a comment, as an independent marketing manager or admin with Page Studio APPROVE who neither authored nor submitted it. Binds the exact reviewComparison. Approval does not publish.',
  marketing_submit_website_version: 'Name the exact current saved Studio draft as a version and submit it for independent review, after acknowledgement. Requires Page Studio EDIT and a connector authorised while signed in to XeroFlow; otherwise reconnect. Never publishes.',
  marketing_build_website_candidate: 'Build the exact independently approved version (digest-bound) as a release candidate for staging or production, after acknowledgement. Returns the build ID and private preview hostname only (open it in Page Studio). Requires Page Studio PUBLISH and the original login proof.',
  marketing_publish_website_version: 'Publish the reviewed candidate build of the exact independently approved version to one hostname, binding the live release you compared, after acknowledgement. Requires Page Studio PUBLISH and the original login proof. An interrupted activation is held for reconciliation and must not be retried blindly.'
}

export const departmentWebsiteTools: AiTool<unknown>[] = (Object.keys(departmentWebsiteContracts) as DepartmentWebsiteToolName[]).map((name) => {
  const mutates = (DEPARTMENT_WEBSITE_WRITE_NAMES as readonly string[]).includes(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentWebsiteContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    ...(name === 'marketing_publish_website_version' ? { riskTier: 'rich_confirm' as const } : {}),
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentWebsiteTool(name, args, ctx)
  }
})

export async function executeDepartmentWebsiteTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentWebsiteTools.some(tool => tool.name === name)) return fail('Unknown department website operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentWebsiteOperation } = await import('../marketing/departmentWebsiteOperations')
  return runDepartmentWebsiteOperation(name, args, ctx, key, digest)
}
