import type { H3Event } from 'h3'

/**
 * Runtime context the tool layer injects into every handler. `userId`/`userRole` are always set by
 * the loop and are the authorization basis — handlers must filter by them and never trust
 * model-supplied ids (see spec §7). `clientScope` is OPTIONAL and only populated on client-scoped
 * surfaces (e.g. the client portal); the agency staff chat does NOT set it, so tools must not rely
 * on it being present for security.
 */
export type ToolContext = {
  userId: string
  userRole: string
  /** Optional — only set on client-scoped surfaces (portal); undefined in the agency staff chat. */
  clientScope?: string
  /** Set by the loop; required for write tools that persist a proposal (create_task). */
  conversationId?: string
  /** Origin of the call. Non-chat surfaces persist proposals with conversation_id NULL and source set. */
  source?: 'chat' | 'mcp' | 'social_inbox'
  /** Server-derived admission scope. This is a narrowing hint for handlers and never authorizes a
   * model-supplied identifier by itself; handlers must still enforce their storage-level ACL. */
  assistantScope?: {
    departmentIds: string[]
    clientAccessMode: 'all_active' | 'assigned'
    assignedClientIds: string[]
    catalogReleaseIds: string[]
  }
  /** Optional — set when the co-pilot is docked in a virtual office room (Mode A). Read-only context;
   *  membership is verified server-side before these are populated (see office/roomContext.ts §7). */
  officeId?: string
  meetingId?: string
  event: H3Event
}

/** Tool results are recoverable: handlers return a typed result, never throw to the loop. */
export type ToolResult = { ok: true, data: unknown, error?: undefined } | { ok: false, error: string }

/**
 * Risk tier of a write action, governing how much human gating it needs (spec: Phase-0 WS-B/C +
 * traffic-controller §5). `auto` = execute directly (reads). `confirm` = one-click propose→confirm
 * (default for any `mutates` tool). `rich_confirm` = high-risk (live ad budgets, Xero pushes): a
 * richer confirm card + counter-model sanity check. Shared leaf type so toolRegistry + executors
 * agree without a circular import.
 */
export type RiskTier = 'auto' | 'confirm' | 'rich_confirm'

export const ok = (data: unknown): ToolResult => ({ ok: true, data })
/** error is natural-language + recoverable — the model can read it and adapt. */
export const fail = (error: string): ToolResult => ({ ok: false, error })

/**
 * Escape ILIKE wildcards so user/model-supplied filter text matches literally. Escapes `\` FIRST
 * (single pass) — relies on Postgres' default `\` escape char, so no explicit ESCAPE clause is needed.
 * Shared by every tool's name/status filters (was duplicated 6 ways, one of which dropped `\`).
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => '\\' + c)
}

/** Cap a list to `n` items and report how many more exist — the compact-projection idiom every read tool uses. */
export function capWithMore<T>(rows: T[], n: number): { items: T[], more: number } {
  return { items: rows.slice(0, n), more: Math.max(0, rows.length - n) }
}
