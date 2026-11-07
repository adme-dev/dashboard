import type { ToolContext } from '../toolContext'
import { createError } from 'h3'
import { isNativeMarketingContext, resolveNativeMarketingContext } from './nativeAuthority'
import { resolveMcpStaffContext } from '../mcp/staffAuthority'
/** Shared department boundary: signed MCP consent or privately branded authenticated native chat;
 * both re-resolve the same current role, grant and client authority on every call. */
export async function requireMarketingDepartment(ctx: ToolContext, write = false): Promise<ToolContext> {
  const deny = (statusMessage: string): never => {
    throw createError({ statusCode: 403, statusMessage })
  }

  const native = isNativeMarketingContext(ctx)
  if (ctx.source !== 'mcp' && !native)
    deny('Verified marketing department transport required')

  const scopes = ctx.mcpScopes instanceof Set ? ctx.mcpScopes : new Set(ctx.mcpScopes ?? [])

  if (!native && !scopes.has('mcp:read'))
    deny('MCP read consent required')

  if (!native && write && !scopes.has('mcp:write'))
    deny('MCP write consent required')

  const fresh = native
    ? await resolveNativeMarketingContext(ctx)
    : await resolveMcpStaffContext(ctx.event, ctx.userId, ctx.mcpScopes)

  if (fresh.mcpStaffAuthority !== 'fresh' || !fresh.permissionGroups?.includes('MARKETING_MANAGEMENT')) {
    deny('Marketing management permission required')
  }

  if (!fresh.marketingCapabilities?.includes('department_management'))
    deny('Marketing department capability required')

  if (write && fresh.assistantReadOnly)
    deny('Marketing role is read-only')

  if (native) return fresh
  return { ...fresh, clientScope: ctx.clientScope, source: 'mcp', mcpScopes: new Set(scopes) }
}
