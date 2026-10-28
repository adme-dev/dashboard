import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentUtilityContracts } from '../marketing/departmentUtilitySchemas'

export const departmentUtilityTools: AiTool<unknown>[] = departmentUtilityContracts.map(([name, parameters, mutates, description]) => ({ name, parameters, mutates, description,
  handler: async (args, ctx) => mutates ? fail('Use the department coordinator', 'forbidden') : (await import('../marketing/departmentUtilityOperations')).executeDepartmentUtilityOperation(name, args, ctx, '', '') }))
export async function executeDepartmentUtilityTool(name: string, args: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  return (await import('../marketing/departmentUtilityOperations')).executeDepartmentUtilityOperation(name, args, ctx, key, digest)
}
