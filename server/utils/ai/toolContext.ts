import type { H3Event } from 'h3'

/**
 * Runtime context the tool layer injects into every handler. Row scoping (userId /
 * clientScope) is NON-OPTIONAL and supplied by the loop — handlers must filter by it,
 * never trust model-supplied ids for authorization (see spec §7).
 */
export type ToolContext = {
  userId: string
  userRole: string
  clientScope?: string
  /** Set by the loop; required for write tools that persist a proposal (create_task). */
  conversationId?: string
  event: H3Event
}

/** Tool results are recoverable: handlers return a typed result, never throw to the loop. */
export type ToolResult = { ok: true, data: unknown } | { ok: false, error: string }

export const ok = (data: unknown): ToolResult => ({ ok: true, data })
/** error is natural-language + recoverable — the model can read it and adapt. */
export const fail = (error: string): ToolResult => ({ ok: false, error })
