import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentLeadContracts } from '../marketing/departmentLeadSchemas'

export const departmentLeadTools: AiTool<unknown>[] = departmentLeadContracts.map(([name, parameters, mutates, description]) => ({
  name,
  parameters,
  mutates,
  description,
  requiredPermission: 'MARKETING_MANAGEMENT',
  returnsUntrusted: true,
  handler: async (args, ctx) => mutates
    ? fail('Use the department lead coordinator', 'coordinator_required')
    : (await import('../marketing/departmentLeadOperations')).runDepartmentLeadOperation(name, args, ctx)
}))
export async function executeDepartmentLeadTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  key: string,
  digest: string
): Promise<ToolResult> {
  return (await import('../marketing/departmentLeadOperations')).runDepartmentLeadOperation(name, args, ctx, key, digest)
}
