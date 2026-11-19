/**
 * Reviewed, versioned defaults for the employee AI assistant (AI Chat / My Assistant).
 *
 * Production Pages sits at Cloudflare's 150 text-binding ceiling, so these defaults are committed
 * here rather than added as new production variables. They are baked into Nuxt private runtime
 * config at build time and apply only when the deployed environment says nothing about a switch.
 * An explicit variable still wins (per-flag legacy variable, or compact `AI_ASSISTANT_CONFIG`; see
 * server/utils/ai/assistantRuntime.ts). To roll one back: set its field to false here and redeploy,
 * or set the per-flag variable to "false" where a binding slot is available.
 *
 * Authorisation is unchanged by these switches: RBAC, per-tool permissions, click-to-confirm writes,
 * independent review and every provider/flag gate below the chat still apply.
 */
export const AI_ASSISTANT_DEFAULTS = {
  /** Governed tool loop for every staff turn (internal XeroFlow tools, marketing MCP suites, skills). */
  tools: true,
  /** Daily observe-and-learn pass that distils a staff member's own routines into personal memory.
   *  Reads only that person's own activity; skipped for anyone whose My Assistant memory is off. */
  observe: true,
  /** Proactive routine suggestions (Observe & Learn W-4). Not wired to any consumer yet. */
  observeProactive: false,
  /** After-response distillation of up to three durable personal memories per chat turn.
   *  Skipped when the user's My Assistant memory is off; memories are viewable/deletable there. */
  memoryDistill: true,
  /** L2 controller: fan cross-department questions out to specialist packs and synthesise one answer. */
  controllerL2: false
} as const

/** Unset/empty variable → reviewed default; otherwise only the exact string `true` enables. */
export function assistantDefaultOr(value: string | undefined, fallback: boolean): boolean {
  return value === undefined || value === '' ? fallback : value === 'true'
}
