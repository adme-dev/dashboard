import type { z } from 'zod'
import { tool, type Tool } from 'ai'
import { roleHasPermission, isReadOnlyRole, type PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult } from './toolContext'
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
  /** true = results contain untrusted text → spotlighted before entering model context. */
  returnsUntrusted?: boolean
  handler: (args: A, ctx: ToolContext) => Promise<ToolResult>
}

/**
 * Pre-send RBAC filter: the model never sees tools the role lacks permission for.
 * Synchronous + fail-closed (see roleHasPermission in permissions.ts).
 */
export function filterToolsForUser<A>(reg: AiTool<A>[], role: string): AiTool<A>[] {
  return reg.filter((t) => {
    // Write tools are never shown to read-only roles (viewer/guest).
    if (t.mutates && isReadOnlyRole(role)) return false
    return !t.requiredPermission || roleHasPermission(role, t.requiredPermission)
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
export function toSdkTools(tools: AiTool<any>[], ctx: ToolContext, seed: string): Record<string, Tool<any, any>> {
  const out: Record<string, Tool<any, any>> = {}
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (args: any) => {
        // Defense-in-depth re-check at execution time.
        if (t.requiredPermission && !roleHasPermission(ctx.userRole, t.requiredPermission)) {
          return { ok: false, error: 'Not permitted.' }
        }
        const res = await t.handler(args, ctx)
        if (res.ok && t.returnsUntrusted) {
          return { ok: true, data: spotlight(JSON.stringify(res.data), `${seed}:${t.name}`) }
        }
        return res
      },
    })
  }
  return out
}
