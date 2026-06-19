/**
 * Counter-model sanity check for high-risk (`rich_confirm`) budget changes (media-buyer spec §7).
 *
 * Before a budget-change proposal's confirm card renders, a cheap second model pass asks "is this
 * change sane?" and flags obvious mistakes (e.g. a 10× jump, or raising an already-overpacing
 * campaign). It is ADVISORY only — surfaced on the card, never auto-blocking and never auto-approving.
 * PURE prompt + tolerant parser + injected completion so it is unit-tested without a model. Fail-OPEN:
 * any parse/model error yields `{ sane: true, concern: null }` so the check can never wrongly block a
 * legitimate change (the human still confirms).
 */

export interface BudgetChangeForCheck {
  campaignName: string
  platform: 'meta' | 'google'
  currentDailyBudget: number
  newDailyBudget: number
  pctChange: number
  /** Optional pacing context to sharpen the check (e.g. 'overpacing'). */
  issueType?: string | null
}

export interface SanityResult {
  sane: boolean
  concern: string | null
}

export interface SanityDeps {
  complete: (prompt: string) => Promise<string>
}

export function buildSanityPrompt(c: BudgetChangeForCheck): string {
  return [
    'You are a media-buying safety reviewer. Judge whether a proposed daily-budget change is SANE.',
    'Flag obvious mistakes: an extreme jump (e.g. >5× or <1/5 of current), raising an already-overpacing',
    'campaign, or a change that looks like a typo. Do NOT flag reasonable adjustments.',
    'Reply with ONLY a JSON object: {"sane": true|false, "concern": "<one short sentence, or empty>"}.',
    '',
    `Campaign: ${c.campaignName} (${c.platform})`,
    `Current daily budget: ${c.currentDailyBudget}`,
    `Proposed daily budget: ${c.newDailyBudget} (${c.pctChange >= 0 ? '+' : ''}${c.pctChange}%)`,
    c.issueType ? `Pacing issue: ${c.issueType}` : '',
  ].filter(Boolean).join('\n')
}

/** Tolerant parse: locate the JSON object, coerce. Anything malformed → sane (fail-open, advisory). */
export function parseSanityResult(text: string): SanityResult {
  if (!text) return { sane: true, concern: null }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return { sane: true, concern: null }
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const sane = obj.sane !== false // default to sane unless explicitly false
    const rawConcern = typeof obj.concern === 'string' ? obj.concern.trim() : ''
    return { sane, concern: !sane && rawConcern ? rawConcern : (rawConcern || null) }
  } catch {
    return { sane: true, concern: null }
  }
}

export async function sanityCheckBudgetChange(change: BudgetChangeForCheck, deps: SanityDeps): Promise<SanityResult> {
  try {
    const raw = await deps.complete(buildSanityPrompt(change))
    return parseSanityResult(raw)
  } catch {
    return { sane: true, concern: null } // fail-open: never block a legitimate change on a model error
  }
}
