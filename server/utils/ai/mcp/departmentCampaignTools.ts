import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentMetaCampaignContracts } from '../marketing/departmentMetaCampaignSchemas'
import { departmentCampaignContracts } from '../marketing/departmentCampaignSchemas'

export const departmentCampaignTools: AiTool<unknown>[] = [...departmentCampaignContracts, ...departmentMetaCampaignContracts].map(([name, parameters, mutates, description]) => ({
  name, parameters, mutates, description, requiredPermission: 'MARKETING_MANAGEMENT', returnsUntrusted: true,
  handler: (args, ctx) => mutates ? Promise.resolve(fail('Use the department campaign execution boundary.', 'coordinator_required')) : executeDepartmentCampaignTool(name, args, ctx)
}))
export async function executeDepartmentCampaignTool(name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string): Promise<ToolResult> {
  if (ctx.source !== 'mcp') return fail('Signed MCP context required.', 'forbidden')
  const tool = departmentCampaignTools.find(t => t.name === name)
  if (!tool) return fail('Unknown campaign operation.', 'not_found')
  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return fail('Invalid campaign arguments.', 'bad_args')
  if (tool.mutates && (!/^mcp:[a-f0-9]{64}$/.test(key ?? '') || !/^[a-f0-9]{64}$/.test(digest ?? ''))) return fail('Verified logical request identity required.', 'coordinator_required')
  if (name.includes('_meta_ad_launch')) {
    const { runDepartmentMetaCampaignOperation } = await import('../marketing/departmentMetaCampaignOperations')
    return runDepartmentMetaCampaignOperation(name, parsed.data, ctx, key, digest)
  }
  const { runDepartmentCampaignOperation } = await import('../marketing/departmentCampaignOperations')
  return runDepartmentCampaignOperation(name, parsed.data, ctx, key, digest)
}
