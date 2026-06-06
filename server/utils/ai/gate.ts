/** Intents treated as trivial chit-chat — kept on the existing fast path, never routed to tools. */
const TRIVIAL_INTENTS = new Set(['general', 'greeting'])

/**
 * Gate decision: route a chat turn to the agentic tool loop only when the feature is enabled,
 * we have a server event (tools need request context), and the intent is non-trivial. Pure +
 * narrowing-only — it can route to the fast path but never grants any capability (RBAC still governs).
 */
export function shouldUseToolLoop(opts: { aiToolsEnabled: boolean, hasEvent: boolean, intent: string }): boolean {
  return Boolean(opts.aiToolsEnabled && opts.hasEvent && !TRIVIAL_INTENTS.has(opts.intent))
}
