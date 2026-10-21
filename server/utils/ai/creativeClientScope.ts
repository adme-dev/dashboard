import type { ToolContext } from './toolContext'

/** Narrow an already authorized context; this does not grant access to a client. */
export function resolveCreativeClientScope(ctx: Pick<ToolContext, 'clientScope'>): string | undefined {
  if (ctx.clientScope === undefined) return undefined
  if (typeof ctx.clientScope !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ctx.clientScope)) {
    throw Object.assign(new Error('Invalid creative client scope'), { boundedCode: 'creative_client_scope_invalid' })
  }
  return ctx.clientScope.toLowerCase()
}
