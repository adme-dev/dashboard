/**
 * MCP Phase 2a fast-follow — per-actor rate limit for generation tools (they BILL, and there's no
 * human-in-the-loop on the start). Reuses the ai_action_audit ledger as the counter (no new store):
 * the endpoint counts a user's recent MCP generation calls and asks this pure predicate whether to
 * refuse. Pure + injected count → unit-testable without a DB.
 */

export const MCP_GEN_RATE_WINDOW_MIN = 10
export const MCP_GEN_RATE_MAX = 20 // generation calls per user per window, over MCP

/** True when the actor has hit/exceeded the cap in the window and the next call must be refused. */
export function isGenerationRateLimited(recentCount: number, max: number = MCP_GEN_RATE_MAX): boolean {
  return recentCount >= max
}
