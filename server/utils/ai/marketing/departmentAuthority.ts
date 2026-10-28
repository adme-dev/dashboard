import type { ToolContext } from '../toolContext'
import { createError } from 'h3'
import { resolveMcpStaffContext } from '../mcp/staffAuthority'
/** Entry boundary shared by the department's MCP services; never authorizes from a cached catalog. */
export async function requireMarketingDepartment(ctx: ToolContext, write = false): Promise<ToolContext> {
  const deny = (statusMessage: string): never => {
    throw createError({ statusCode: 403, statusMessage })
  }

  if (ctx.source !== 'mcp')
    deny('Marketing department MCP context required')

  const scopes = ctx.mcpScopes instanceof Set ? ctx.mcpScopes : new Set(ctx.mcpScopes ?? [])

  if (!scopes.has('mcp:read'))
    deny('MCP read consent required')

  if (write && !scopes.has('mcp:write'))
    deny('MCP write consent required')

  const fresh = await resolveMcpStaffContext(ctx.event, ctx.userId, ctx.mcpScopes)

  if (fresh.mcpStaffAuthority !== 'fresh' || !fresh.permissionGroups?.includes('MARKETING_MANAGEMENT')) {
    deny('Marketing management permission required')
  }

  if (!fresh.marketingCapabilities?.includes('department_management'))
    deny('Marketing department capability required')

  if (write && fresh.assistantReadOnly)
    deny('Marketing role is read-only')

  return { ...fresh, clientScope: ctx.clientScope, source: 'mcp', mcpScopes: new Set(scopes) }
}
