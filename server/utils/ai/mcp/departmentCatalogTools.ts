import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentCatalogContracts } from '../marketing/departmentCatalogSchemas'

export const departmentCatalogTools: AiTool<unknown>[] = departmentCatalogContracts.map(([name, parameters, mutates, description]) => ({
  name, parameters, mutates, description, requiredPermission: 'MARKETING_MANAGEMENT', returnsUntrusted: true,
  handler: (args, ctx) => mutates ? Promise.resolve(fail('Use the department catalog execution boundary.', 'coordinator_required')) : executeDepartmentCatalogTool(name, args, ctx)
}))
export async function executeDepartmentCatalogTool(name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string): Promise<ToolResult> {
  const tool = departmentCatalogTools.find(t => t.name === name)
  if (!tool) return fail('Unknown catalog operation.', 'not_found')
  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return fail('Invalid catalog arguments.', 'bad_args')
  if (ctx.source !== 'mcp') return fail('Signed MCP context required.', 'forbidden')
  if (tool.mutates && (!/^mcp:[a-f0-9]{64}$/.test(key ?? '') || !/^[a-f0-9]{64}$/.test(digest ?? ''))) return fail('Verified logical request identity required.', 'coordinator_required')
  const { runDepartmentCatalogOperation } = await import('../marketing/departmentCatalogOperations')
  return runDepartmentCatalogOperation(name, parsed.data, ctx, key, digest)
}
