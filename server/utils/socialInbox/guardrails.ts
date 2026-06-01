// server/utils/socialInbox/guardrails.ts
// PURE, deterministic safety + condition logic for the reply automation engine.
// No I/O, no DB, no Groq. This is the primary, testable safety layer — the model's
// self-reported risk is only secondary defense-in-depth.
import type { AutomationContext, BusinessHours, RuleConditions } from './automationTypes'

/**
 * HARD SAFETY RULE: any inbound that looks like a complaint, legal threat, or PR risk
 * must never be auto-answered — the engine forces it to human approval. Matched on word
 * tokens (case-insensitive, punctuation-split) so "SCAM!!!" matches but "re-fund" does not.
 * Keep this list conservative (false-positive → human, which is the safe direction).
 */
const RISK_TERMS: string[] = [
  'sue', 'lawyer', 'legal', 'lawsuit', 'court', 'attorney',
  'scam', 'fraud', 'stole', 'stolen', 'theft', 'rip off', 'ripoff', 'ripped off',
  'refund', 'chargeback', 'money back', 'compensation', 'overcharged', 'overcharge',
  'disgusting', 'disgrace', 'appalling', 'unacceptable', 'worst', 'terrible', 'awful',
  'horrible', 'rude', 'liar', 'lying', 'lied', 'mislead', 'misleading', 'misled', 'false',
  'broken', 'defective', 'faulty', 'damaged', 'useless',
  'report you', 'reported', 'complaint', 'complain', 'ombudsman', 'accc', 'fair trading',
  'dangerous', 'injury', 'injured', 'sick', 'unsafe', 'allergic',
  'racist', 'sexist', 'harass',
  'never again', 'boycott', 'cancel my', 'cancelling', 'canceling',
]

/** Single-word terms matched as a prefix (covers inflections like discriminate/discrimination). */
const STEM_TERMS: string[] = ['discriminat']

export interface RiskResult { risky: boolean; reasons: string[] }

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean))
}

export function detectReplyRisk(content: string): RiskResult {
  const raw = content || ''
  const padded = ` ${raw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  const tokens = tokenSet(raw)
  const reasons: string[] = []
  for (const term of [...RISK_TERMS, ...STEM_TERMS]) {
    if (term.includes(' ')) {
      if (padded.includes(` ${term} `)) reasons.push(term)
    } else if (STEM_TERMS.includes(term)) {
      if ([...tokens].some(t => t.startsWith(term))) reasons.push(term)
    } else if (tokens.has(term)) {
      reasons.push(term)
    }
  }
  return { risky: reasons.length > 0, reasons }
}

/** Minutes since local midnight for a Date in a given IANA tz, plus ISO weekday (1=Mon..7=Sun). */
function localParts(now: Date, tz: string): { minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const hour = Number(get('hour')) % 24 // Intl can emit "24" at midnight in some locales
  const minute = Number(get('minute'))
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { minutes: hour * 60 + minute, weekday: wkMap[get('weekday')] ?? 0 }
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * True if `now` falls within the rule's business-hours window. Assumes start <= end on the same
 * day (no overnight wrap — an overnight window evaluates as "never in hours", which is the safe
 * direction since it only downgrades autopilot → approval). null window = always within.
 */
export function isWithinBusinessHours(now: Date, bh: BusinessHours | null): boolean {
  if (!bh) return true
  let lp
  try { lp = localParts(now, bh.tz || 'UTC') } catch { return true } // bad tz → don't block
  if (!bh.days?.includes(lp.weekday)) return false
  const start = hhmmToMinutes(bh.start || '00:00')
  const end = hhmmToMinutes(bh.end || '23:59')
  return lp.minutes >= start && lp.minutes <= end
}

/**
 * Evaluate a rule's content/rating conditions against the inbound context.
 * NOTE: `businessHoursOnly` is intentionally ignored here — the engine enforces business
 * hours separately via the rule's `business_hours` window. This function is rating + keywords.
 */
export function evaluateRuleConditions(ctx: AutomationContext, c: RuleConditions): boolean {
  if (c.ratingMin != null || c.ratingMax != null) {
    if (ctx.rating == null) return false
    if (c.ratingMin != null && ctx.rating < c.ratingMin) return false
    if (c.ratingMax != null && ctx.rating > c.ratingMax) return false
  }
  const text = (ctx.inboundContent || '').toLowerCase()
  if (c.keywordsAny?.length) {
    if (!c.keywordsAny.some(k => text.includes(k.toLowerCase()))) return false
  }
  if (c.keywordsNone?.length) {
    if (c.keywordsNone.some(k => text.includes(k.toLowerCase()))) return false
  }
  return true
}
