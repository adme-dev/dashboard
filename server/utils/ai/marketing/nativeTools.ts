import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { resolveNativeMarketingContext } from './nativeAuthority'
import { sha256 } from './departmentExecutionLedger'
import type { NativeMarketingEnvelope } from './nativePendingActions'
import { effectiveRiskTier } from '../toolRegistry'
import type { McpSuiteFlags } from '../mcp/project'

interface Dependencies {
  resolve: typeof resolveNativeMarketingContext
  admitted: (name: string, ctx: ToolContext) => boolean
  authorizeConfirmation: (tool: AiTool<unknown>, ctx: ToolContext) => Promise<boolean>
  tools: AiTool<unknown>[]
  flags: McpSuiteFlags
  propose: (ctx: ToolContext, messageId: string, operation: string, args: unknown, riskTier: 'confirm' | 'rich_confirm') => Promise<ToolResult>
  run: (name: string, args: unknown, ctx: ToolContext, key: string, digest: string) => Promise<ToolResult>
  audit: (name: string, args: unknown, ctx: ToolContext, result: ToolResult) => Promise<void>
}
async function dependencies(ctx: ToolContext): Promise<Dependencies> {
  const [{ toolsFor, executeDepartmentTool }, { evaluateStaffToolAdmission }, { resolveMcpRuntimeConfig }] = await Promise.all([
    import('../mcp/departmentTools'), import('../mcp/marketingPolicy'), import('../mcp/runtimeConfig')
  ])
  const config = resolveMcpRuntimeConfig(ctx.event)
  const flags = config.suiteFlags
  return { resolve: resolveNativeMarketingContext, flags, tools: config.serverEnabled ? toolsFor(flags) : [],
    authorizeConfirmation: async (tool, ctx) => (await import('./nativeConfirmationPolicy')).nativeConfirmationAllowed(tool, ctx),
    propose: async (ctx, messageId, name, args, riskTier) => {
      const current = resolveMcpRuntimeConfig(ctx.event)
      if (!current.serverEnabled || !toolsFor(current.suiteFlags).some(tool => tool.name === name)) return fail('Marketing operations are disabled.', 'disabled')
      return (await import('./nativePendingActions')).prepareNativeMarketingAction(ctx, messageId, name, args, riskTier)
    },
    admitted: (name, fresh) => evaluateStaffToolAdmission(name, fresh).allowed,
    run: (name, args, fresh, key, digest) => resolveMcpRuntimeConfig(fresh.event).serverEnabled
      ? executeDepartmentTool(name, args, fresh, key, digest)
      : Promise.resolve(fail('Marketing operations are disabled.', 'disabled')),
    audit: async (name, args, fresh, result) => {
      const [{ execute }, { departmentAudit }] = await Promise.all([import('~~/server/utils/db'), import('../mcp/departmentAudit')])
      const audit = departmentAudit(name, args, result, toolsFor(flags).find(tool => tool.name === name)?.riskTier)
      if (!audit) return
      await execute(`INSERT INTO ai_action_audit (pending_id,user_id,confirmed_by,tool_name,risk_tier,client_scope,payload,outcome)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [audit.pendingId, fresh.userId,
        audit.actionClass === 'review' && result.ok ? fresh.userId : null, name, audit.riskTier,
        fresh.clientScope ?? null, JSON.stringify({ source: 'chat', actionClass: audit.actionClass, argKeys: Object.keys((args ?? {}) as object) }), audit.outcome]).catch(() => {})
    }
  }
}

/** Reviewed department operations only, with the original schemas and risk annotations. Callers MUST
 * feed these through normal catalog/persona/disabled/read-only composition before SDK exposure.
 * Legacy department proposal storage uses the shared MCP discriminator so peer review crosses
 * transports; runtime provenance, execution identities and action audit retain the actual chat source.
 */
export async function buildNativeMarketingTools(ctx: ToolContext, messageId?: string, injected?: Dependencies): Promise<AiTool<unknown>[]> {
  if (ctx.source !== 'chat' || !ctx.event) return []
  try {
    const deps = injected ?? await dependencies(ctx)
    const fresh = await deps.resolve(ctx)
    return deps.tools.filter(tool => deps.admitted(tool.name, fresh) && (!tool.mutates || Boolean(messageId)))
      .map(tool => ({ ...tool,
        // Mutations now return only our server-owned click-confirm envelope, not provider text.
        returnsUntrusted: tool.mutates ? false : tool.returnsUntrusted,
        description: tool.mutates ? `${tool.description} Native chat only PREPARES a confirmation card. The user must click Confirm before this operation runs; independent domain review is still required.` : tool.description,
        handler: async (args: unknown) => {
          try {
            const current = await deps.resolve(ctx)
            if (!deps.admitted(tool.name, current)) return fail('Marketing operation is no longer permitted.', 'forbidden')
            const parsed = tool.parameters.safeParse(args)
            if (!parsed.success) return fail('Invalid marketing arguments.', 'bad_args')
            if (tool.mutates) {
              const tier = effectiveRiskTier(tool)
              return deps.propose(current, messageId!, tool.name, parsed.data, tier === 'rich_confirm' ? 'rich_confirm' : 'confirm')
            }
            // Stable across provider fallback and retries, bound to the authenticated actor and persisted
            // message; canonical parsed input prevents one identity being reused for different intent.
            const digest = sha256({ actor: current.userId, messageId, tool: tool.name, args: parsed.data })
            const key = `chat:${digest}`
            const result = await deps.run(tool.name, parsed.data, current, key, digest)
            // An audit-storage outage must not turn a completed durable operation into a retryable failure.
            await deps.audit(tool.name, parsed.data, current, result).catch(() => {})
            return result
          } catch { return fail('Marketing operation unavailable or no longer permitted.', 'unavailable') }
        } }))
  } catch { return [] }
}

/** Discovery never executes a provider operation or creates a proposal. */
export async function discoverNativeMarketingTools(ctx: ToolContext): Promise<AiTool<unknown>[]> {
  // A discovery-only sentinel includes writes for composition; these handlers are never returned to
  // an SDK. Execution always requires the real persisted message ID through buildNativeMarketingTools.
  return (await buildNativeMarketingTools(ctx, 'discovery-only')).map(tool => ({
    ...tool, handler: async () => fail('Discovery does not execute operations.', 'discovery_only')
  }))
}

/** Called only by the registered human-click executor, never exposed as an SDK tool. */
export async function executeConfirmedNativeMarketingAction(envelope: NativeMarketingEnvelope, ctx: ToolContext, injected?: Dependencies): Promise<ToolResult> {
  try {
    const deps = injected ?? await dependencies(ctx)
    const fresh = await deps.resolve(ctx)
    const tool = deps.tools.find(tool => tool.name === envelope.operation && tool.mutates)
    if (!tool || !deps.admitted(tool.name, fresh) || !await deps.authorizeConfirmation(tool, fresh)) return fail('Marketing action is no longer permitted.', 'forbidden')
    const tier = effectiveRiskTier(tool) === 'rich_confirm' ? 'rich_confirm' : 'confirm'
    if (tier !== envelope.riskTier) return fail('Marketing confirmation policy changed.', 'forbidden')
    const parsed = tool.parameters.safeParse(envelope.args)
    if (!parsed.success) return fail('Marketing confirmation arguments are invalid.', 'bad_args')
    const result = await deps.run(tool.name, parsed.data, fresh, envelope.executionKey, envelope.digest)
    await deps.audit(tool.name, parsed.data, fresh, result).catch(() => {})
    return result
  } catch { return fail('Marketing execution unavailable; inspect its retained domain outcome.', 'unavailable') }
}
