import type { H3Event } from 'h3'
import type { z } from 'zod'
import { tool, type Tool } from 'ai'
import { queryRows, queryOne } from '~~/server/utils/db'
import { ok, fail, escapeLike, capWithMore, type ToolResult } from '../toolContext'
import { spotlight } from '../spotlight'

/**
 * Client-portal co-pilot foundation (portal-agent spec §3/§8). This is the HIGHEST-stakes surface —
 * it lives OUTSIDE the agency trust boundary, used by the customer. The entire design enforces one
 * non-negotiable: hard tenant isolation — a customer can only ever see their own client's data.
 *
 * Four defense layers (spec §3):
 *   1. SEPARATE registry — the portal loop is built from `portalRegistry` only; agency tools never enter.
 *   2. `clientScope` REQUIRED — a portal context without it is a hard error (`assertPortalScope`), not a
 *      silent fallback. (Contrast the agency `ToolContext`, where `clientScope` is optional.)
 *   3. Every tool filters by `clientScope` — bound as `$1`, the tenant key. No tool trusts a
 *      model-supplied client id, EVER.
 *   4. No cross-client tools exist here — portfolio/ranking/other-client tools are simply absent.
 */

// Re-export the shared, side-effect-free tool helpers so portal tools don't reach into the agency module.
export { ok, fail, escapeLike, capWithMore }
export type { ToolResult }

/** Injected DB surface (mirrors the agency tools' deps pattern) so portal handlers are unit-testable. */
export interface PortalDb {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>
}

export const defaultPortalDb: PortalDb = { queryRows, queryOne }

/**
 * Portal tool context. `clientScope` (= `agency_clients.id`, the session's client) is REQUIRED — it is
 * the tenant key bound as `$1` in every query. `clientUserId` (= `client_users.id`) scopes personal
 * memory. There is deliberately NO `userRole` / RBAC here: portal capability is governed by the client's
 * assigned apps + tier, not staff roles.
 */
export type PortalToolContext = {
  /** REQUIRED tenant key — `agency_clients.id`. Every query filters `WHERE client_id = $1` on this. */
  clientScope: string
  /** The portal user — `client_users.id`. Used for personal-memory scope + write-proposal ownership. */
  clientUserId: string
  /** The portal conversation — required for a write tool to persist its proposal. */
  conversationId?: string
  event: H3Event
  /** Injected DB (defaults to the real db); lets every handler be unit-tested without a database. */
  db?: PortalDb
}

/**
 * The required-scope guard (spec §12 acceptance #1: "the portal agent refuses to run without it").
 * Call this at the entry of ANY portal agent turn BEFORE constructing tools. A missing/blank
 * `clientScope` is a hard error, never a fallback to unscoped data.
 */
export function assertPortalScope(ctx: { clientScope?: string | null }): asserts ctx is { clientScope: string } {
  if (!ctx.clientScope || typeof ctx.clientScope !== 'string') {
    throw new Error('Portal agent invoked without a clientScope — refusing to run (tenant isolation).')
  }
}

/** Resolve the db a handler should use (injected wins; defaults to the real db). */
export function portalDb(ctx: PortalToolContext): PortalDb {
  return ctx.db ?? defaultPortalDb
}

/**
 * Persist a Tier-2 portal write PROPOSAL (Option B: the model proposes, the confirm endpoint executes).
 * The row is tenant-tagged with `client_scope = clientScope` and owned by `clientUserId`, so the portal
 * confirm endpoint can only claim it for the same client+user. Never writes the real mutation.
 */
export async function proposePortalAction(ctx: PortalToolContext, toolName: string, resolvedPayload: unknown): Promise<string> {
  assertPortalScope(ctx)
  if (!ctx.conversationId) throw new Error('Portal write proposal requires a conversation')
  const row = await portalDb(ctx).queryOne<{ id: string }>(
    `INSERT INTO ai_pending_actions (conversation_id, user_id, tool_name, resolved_payload, status, client_scope)
     VALUES ($1, $2, $3, $4, 'proposed', $5)
     RETURNING id`,
    [ctx.conversationId, ctx.clientUserId, toolName, JSON.stringify(resolvedPayload), ctx.clientScope],
  )
  if (!row) throw new Error('Failed to persist portal proposal')
  return row.id
}

/**
 * Portal tool definition. Distinct from the agency `AiTool`: the handler receives a `PortalToolContext`
 * (clientScope REQUIRED) and there is no `requiredPermission`/RBAC slot. Tier 1 is read-only, so
 * `mutates` is intentionally absent here — it arrives with Tier 2 own-data actions.
 */
export interface PortalAiTool<A> {
  name: string
  description: string
  parameters: z.ZodType<A>
  /** true = results contain untrusted text → spotlighted before entering model context. */
  returnsUntrusted?: boolean
  /** true = write tool (Tier 2) → handler only PROPOSES; the confirm endpoint executes. */
  mutates?: boolean
  /** Human-gating tier for a write (defaults to 'confirm'); the confirm endpoint can demand richer. */
  riskTier?: 'auto' | 'confirm' | 'rich_confirm'
  handler: (args: A, ctx: PortalToolContext) => Promise<ToolResult>
}

/**
 * Convert the portal registry into AI SDK tools. Mirrors the agency `toSdkTools` but over the PORTAL
 * context — and re-asserts the scope guard at execute time (defense in depth: even if a caller skipped
 * the entry guard, no portal tool can run unscoped).
 */
export function toPortalSdkTools(tools: PortalAiTool<any>[], ctx: PortalToolContext, seed: string): Record<string, Tool<any, any>> {
  const out: Record<string, Tool<any, any>> = {}
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (args: any) => {
        assertPortalScope(ctx)
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
