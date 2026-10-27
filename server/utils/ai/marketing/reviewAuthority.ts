// server/utils/ai/marketing/reviewAuthority.ts
// Fresh authority at the delegated-marketing review and dispatch boundaries.
//
// Both helpers reuse Task 1's uncached resolveMcpStaffContext (identity, custom/system role policy,
// active client assignments, operator-owned MCP_MARKETING_STAFF_GRANTS). There is no second grant format
// and no role cache. OAuth scope is checked where a user request carries one (tool call / review click);
// cron and workflow callbacks never fabricate scopes — they pass none and still lose access when the
// database grant, assignment, role or active flag is revoked.
import { createError, type H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import type { MarketingCapability, ToolContext } from '~~/server/utils/ai/toolContext'
import { resolveMcpStaffContext, type McpStaffAuthorityOptions } from '~~/server/utils/ai/mcp/staffAuthority'
import { MCP_WRITE_SCOPE } from '~~/server/utils/ai/mcp/scope'

export interface MarketingBoundaryOptions extends McpStaffAuthorityOptions {
  /** Signed scopes of the current user request; omit for cron/workflow dispatch. */
  scopes?: Iterable<string>
  /** Require the signed mcp:write scope (local mutations requested by the user). */
  requireWriteScope?: boolean
  /** Lookup for "client is active" (all-client staff); defaults to an uncached read. */
  clientIsActive?: (clientId: string) => Promise<boolean>
}

export interface IndependentReviewer {
  id: string
  role: string
  name: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function forbidden(statusMessage: string): never {
  throw createError({ statusCode: 403, statusMessage })
}

async function defaultClientIsActive(clientId: string): Promise<boolean> {
  if (!UUID.test(clientId)) return false
  const row = await queryOneFresh<{ id: string }>(
    'SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE',
    [clientId]
  )
  return !!row
}

/** Whether a fresh staff context currently covers `clientId` (never widens a client restriction). */
export async function freshContextCoversClient(
  ctx: Pick<ToolContext, 'assistantScope' | 'clientScope'>,
  clientId: string,
  clientIsActive: (clientId: string) => Promise<boolean> = defaultClientIsActive
): Promise<boolean> {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) return false
  if (ctx.clientScope && ctx.clientScope !== clientId) return false
  const scope = ctx.assistantScope
  if (!scope) return false
  if (scope.clientAccessMode === 'assigned') return scope.assignedClientIds.includes(clientId)
  return scope.clientAccessMode === 'all_active' && await clientIsActive(clientId)
}

/**
 * Freshly resolve `actorId` and require: active identity, writable role policy, the explicit marketing
 * `capability` grant and current access to `clientId`. Returns the fresh ToolContext.
 *   403 — inactive actor, revoked grant/assignment, read-only role, or missing signed write scope
 *   503 — authority storage unavailable (callers treat it as transient, never as permission)
 */
export async function assertMarketingCapabilityAtBoundary(
  event: H3Event,
  actorId: string,
  clientId: string,
  capability: MarketingCapability,
  options: MarketingBoundaryOptions = {}
): Promise<ToolContext> {
  const scopes = [...(options.scopes ?? [])]
  const ctx = await resolveMcpStaffContext(event, actorId, scopes, options)
  if (!(ctx.marketingCapabilities ?? []).includes(capability)) {
    forbidden('MARKETING_CAPABILITY_REQUIRED')
  }
  if (ctx.assistantReadOnly === true) forbidden('MARKETING_ROLE_READ_ONLY')
  if (options.requireWriteScope && !scopes.includes(MCP_WRITE_SCOPE)) forbidden('MCP_WRITE_SCOPE_REQUIRED')
  if (!await freshContextCoversClient(ctx, clientId, options.clientIsActive)) forbidden('MARKETING_CLIENT_NOT_ASSIGNED')
  return ctx
}

/**
 * The delegated-marketing reviewer: a currently active owner/admin (fresh ADMIN group), who is NOT the
 * requester — an admin requester cannot review their own submission either — and the client must be
 * an active client. Leads/project managers (MANAGEMENT without ADMIN) are not reviewers. This grants no
 * owner/God-mode authority. `reviewerId` defaults to the signed-in browser user.
 */
export async function requireIndependentMarketingReviewer(
  event: H3Event,
  input: { requesterId: string, clientId: string, reviewerId?: string },
  options: Omit<MarketingBoundaryOptions, 'scopes' | 'requireWriteScope'> = {}
): Promise<IndependentReviewer> {
  let reviewerId = input.reviewerId
  if (!reviewerId) {
    const { requireAuth } = await import('~~/server/utils/auth')
    reviewerId = (await requireAuth(event)).id
  }
  if (!reviewerId || !input.requesterId) forbidden('INDEPENDENT_REVIEWER_REQUIRED')
  if (reviewerId.toLowerCase() === input.requesterId.toLowerCase()) {
    forbidden('Requesters cannot review their own delegated submission')
  }
  const ctx = await resolveMcpStaffContext(event, reviewerId, [], options)
  if (!(ctx.permissionGroups ?? []).includes('ADMIN')) {
    forbidden('Only an owner or admin can review delegated marketing work')
  }
  if (ctx.assistantReadOnly === true) forbidden('MARKETING_ROLE_READ_ONLY')
  if (!await freshContextCoversClient(ctx, input.clientId, options.clientIsActive)) {
    forbidden('MARKETING_CLIENT_NOT_AVAILABLE')
  }
  return { id: reviewerId, role: ctx.userRole, name: ctx.userName ?? null }
}

/** True for definitive denials (revocation); false for transient authority-storage failures. */
export function isDefinitiveAuthorityDenial(error: unknown): boolean {
  const status = (error as { statusCode?: number })?.statusCode
  return status === 403 || status === 404
}
