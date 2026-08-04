import type { z } from 'zod'
import { tool, type Tool } from 'ai'
import {
  isActiveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'
import { roleHasPermission, isReadOnlyRole, type PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult, RiskTier } from './toolContext'
import { spotlight } from './spotlight'

/**
 * Declarative tool definition. `requiredPermission` / `mutates` / `returnsUntrusted` are
 * OUR annotations (no native AI SDK slots); the loop derives behavior from them.
 */
export interface AiTool<A> {
  name: string
  /** 3-4 sentences: purpose, when to use, when NOT, what it returns. */
  description: string
  /** Zod schema — validated in; emitted to the SDK as `inputSchema`. */
  parameters: z.ZodType<A>
  /** undefined = any authed user. Checked pre-send (filterToolsForUser) + at execute time. */
  requiredPermission?: PermissionGroup
  /** true = write tool → handler only PROPOSES (Option B); never writes directly. */
  mutates?: boolean
  /**
   * Override the human-gating tier for a write tool. Defaults via effectiveRiskTier():
   * read tools → 'auto', `mutates` tools → 'confirm'. Set 'rich_confirm' for high-risk writes
   * (live ad budgets, Xero pushes) so the confirm endpoint can demand a richer card + sanity check.
   */
  riskTier?: RiskTier
  /** true = results contain untrusted text → spotlighted before entering model context. */
  returnsUntrusted?: boolean
  handler: (args: A, ctx: ToolContext) => Promise<ToolResult>
}

/**
 * Resolve a tool's effective risk tier: explicit `riskTier` wins; otherwise a write (`mutates`)
 * defaults to 'confirm' and a read defaults to 'auto'. Single source of truth for the confirm
 * endpoint and the (future) traffic controller.
 */
export function effectiveRiskTier(t: Pick<AiTool<any>, 'mutates' | 'riskTier'>): RiskTier {
  return t.riskTier ?? (t.mutates ? 'confirm' : 'auto')
}

/**
 * Pre-send RBAC filter: governed users never see tools their role lacks. Matching Task 2 authority
 * admits the registry before model execution; all other inputs remain synchronous and fail closed.
 */
export function filterToolsForUser<A>(
  reg: AiTool<A>[],
  role: string,
  resolvedPermissionGroups?: readonly PermissionGroup[],
  resolvedReadOnly?: boolean,
  authority?: GodModeAuthority,
  authenticatedUserId?: string
): AiTool<A>[] {
  if (
    typeof authenticatedUserId === 'string'
    && isActiveGodModeAuthority(authority, authenticatedUserId)
  ) return reg

  return reg.filter((t) => {
    // Write tools are never shown to read-only roles (viewer/guest).
    if (t.mutates && (resolvedReadOnly === true || isReadOnlyRole(role))) return false
    if (!t.requiredPermission) return true
    return resolvedPermissionGroups
      ? resolvedPermissionGroups.includes(t.requiredPermission)
      : roleHasPermission(role, t.requiredPermission)
  })
}

/**
 * Convert our registry into the AI SDK `tools` object.
 *
 * Option B (spec §8): mutating tools do NOT write — their handler only persists a proposal
 * to ai_pending_actions and returns `{ proposalId, resolved }`. A separate confirm endpoint
 * executes on user click. So every tool gets an `execute`; for write tools that execute is the
 * propose step, NOT the mutation. (ai@6 has no `toolApproval` on the call; tool-level
 * `needsApproval` would force the SDK's two-call resume — we deliberately avoid it.)
 *
 * Defense in depth: re-check permission at execute time even though filterToolsForUser already
 * dropped disallowed tools. Untrusted results are spotlighted with a per-call seed.
 */
export function toSdkTools(
  tools: AiTool<any>[],
  ctx: ToolContext,
  seed: string,
  authority?: GodModeAuthority,
  godModeExecution?: {
    /** Persisted message/request identity; never a timestamp or caller role/email. */
    executionIdentity: string
    claimGodModeToolCall?: (request: import('./godModeExecution').GodModeToolCallClaimRequest) => Promise<import('./godModeExecution').GodModeToolCallClaim>
    executeGodModeTool?: (request: import('./godModeExecution').GodModeExecutionRequest) => Promise<ToolResult>
    executeGodModeReadTool?: (request: import('./godModeExecution').GodModeReadExecutionRequest) => Promise<ToolResult>
  }
): Record<string, Tool<any, any>> {
  const godModeActive = isActiveGodModeAuthority(authority, ctx.userId)
  const out: Record<string, Tool<any, any>> = {}
  let nextToolOrdinal = 0
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (args: any, _callOptions: any) => {
        const ordinal = nextToolOrdinal++
        // Defense-in-depth re-check at execution time.
        const permissionGranted = !t.requiredPermission || (ctx.permissionGroups
          ? ctx.permissionGroups.includes(t.requiredPermission)
          : roleHasPermission(ctx.userRole, t.requiredPermission))
        if (!godModeActive && (
          !permissionGranted
          || (t.mutates && (ctx.assistantReadOnly === true || isReadOnlyRole(ctx.userRole)))
        )) {
          return { ok: false, error: 'Not permitted.' }
        }
        let res: ToolResult
        if (godModeActive) {
          const mod = await import('./godModeExecution')
          if (t.mutates) {
            if (!godModeExecution?.executionIdentity || !ctx.event) {
              return { ok: false, error: 'Durable tool-call identity is unavailable.' }
            }
            const claim = await (godModeExecution.claimGodModeToolCall ?? mod.claimGodModeToolCall)({
              messageId: godModeExecution.executionIdentity,
              ordinal,
              toolName: t.name,
              args
            })
            res = await (godModeExecution?.executeGodModeTool ?? mod.executeGodModeTool)({
              event: ctx.event,
              conversationId: ctx.conversationId,
              toolName: t.name,
              args,
              idempotencyKey: mod.deriveGodModeToolClaimIdempotencyKey(claim.messageId, claim.claimId),
              clientId: ctx.clientScope
            })
          } else {
            res = await (godModeExecution?.executeGodModeReadTool ?? mod.executeGodModeReadTool)({
              event: ctx.event,
              tool: t,
              args,
              ctx,
              clientId: ctx.clientScope
            })
          }
        } else {
          res = await t.handler(args, ctx)
        }
        if (res.ok && t.returnsUntrusted) {
          return { ok: true, data: spotlight(JSON.stringify(res.data), `${seed}:${t.name}`) }
        }
        return res
      },
    })
  }
  return out
}
