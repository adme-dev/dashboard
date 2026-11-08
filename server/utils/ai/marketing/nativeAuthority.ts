import { requireAuth } from '~~/server/utils/auth'
import type { ToolContext } from '../toolContext'

// Runtime provenance, never a model/client supplied flag. No OAuth scopes are minted for chat.
const nativeContexts = new WeakSet<ToolContext>()
export const isNativeMarketingContext = (ctx: ToolContext): boolean =>
  ctx.source === 'chat' && nativeContexts.has(ctx)

export async function resolveNativeMarketingContext(ctx: ToolContext): Promise<ToolContext> {
  const user = await requireAuth(ctx.event)
  if (user.id !== ctx.userId || ctx.source !== 'chat') throw new Error('Authenticated chat actor required')
  const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
  const fresh = await resolveMcpStaffContext(ctx.event, user.id, [])
  const native: ToolContext = { ...fresh, source: 'chat', mcpScopes: undefined,
    clientScope: ctx.clientScope, conversationId: ctx.conversationId }
  nativeContexts.add(native)
  return native
}
