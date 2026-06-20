/**
 * L2 tier classification for the traffic controller (spec §3/§4). PURE prompt + tolerant parser +
 * injected LLM, so the routing decision is unit-tested without a model. Decides whether a request is
 * single-domain (L1 — the default, ~80% of turns) or genuinely spans ≥2 domains (L2 — supervise:
 * decompose, delegate, synthesize). Conservative by design: anything ambiguous or unparseable →
 * L1 (per §3 "when unsure, prefer L1"). The domain vocabulary mirrors the SKILL_PACKS domains.
 */

export const CONTROLLER_DOMAINS = ['finance', 'media', 'accounts', 'sales', 'marketing', 'work'] as const
export type ControllerDomain = typeof CONTROLLER_DOMAINS[number]

export type Tier = 'L1' | 'L2'

export interface Classification {
  tier: Tier
  domains: ControllerDomain[]
  reason: string
}

export interface ClassifyDeps {
  complete: (prompt: string) => Promise<string>
}

export function buildClassifyPrompt(message: string): string {
  return [
    'You route an internal agency request to the right specialist(s). Decide if it needs ONE domain',
    '(most requests) or genuinely spans TWO OR MORE distinct domains that must be combined.',
    `Domains: ${CONTROLLER_DOMAINS.join(', ')} (finance=cash/P&L/profitability, media=ad spend/campaigns,`,
    'accounts=client delivery/projects/tasks, sales=pipeline/pricing, marketing=social/content, work=tasks/boards).',
    'Reply with ONLY JSON: {"tier":"L1|L2","domains":["..."],"reason":"<short>"}.',
    'Use L2 ONLY when the request clearly requires combining ≥2 domains (e.g. "which over-servicing',
    'clients are also under-pacing on ads"). When in doubt, choose L1.',
    '',
    `Request: ${message}`,
  ].join('\n')
}

const isDomain = (s: unknown): s is ControllerDomain =>
  typeof s === 'string' && (CONTROLLER_DOMAINS as readonly string[]).includes(s)

/** Tolerant parse: locate the JSON object, validate. Malformed/ambiguous → L1 (conservative). */
export function parseClassification(text: string): Classification {
  const fallback: Classification = { tier: 'L1', domains: [], reason: 'default' }
  if (!text) return fallback
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return fallback

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return fallback
  }

  const domains = Array.isArray(obj.domains) ? [...new Set(obj.domains.filter(isDomain))] : []
  const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : ''
  // L2 requires the model to BOTH say L2 and name ≥2 distinct domains — a single-domain "L2" is
  // downgraded (the supervisor only earns its cost on real cross-domain work).
  const tier: Tier = (obj.tier === 'L2' && domains.length >= 2) ? 'L2' : 'L1'
  return { tier, domains, reason: reason || (tier === 'L2' ? 'cross-domain' : 'single-domain') }
}

export async function classifyRequest(message: string, deps: ClassifyDeps): Promise<Classification> {
  try {
    const raw = await deps.complete(buildClassifyPrompt(message))
    return parseClassification(raw)
  } catch {
    return { tier: 'L1', domains: [], reason: 'classify-error-fallback' } // fail-safe to the cheap path
  }
}
