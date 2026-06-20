import type { MemType } from '../memory/types'
import type { RoutineCandidate } from './sessionize'

/**
 * Observe & Learn W-2 — observed-memory distiller (spec §3 distil step). Given a user's recurring
 * ROUTINE candidates (already day/hour/sequence-detected, sensitive actions stripped by detectRoutines),
 * a cheap model (gpt-oss-20b) proposes ≤3 durable memories describing how this person works. PURE prompt
 * + tolerant parser + injected `complete` so it's unit-tested without a model.
 *
 * Conservative by design (mirrors memory/distill.ts): malformed output → [] (no crash, no retry storm);
 * dedups against existing memory; hard cap to avoid memory pollution. Memories land as
 * `source='observed'`, `scope='user'` — strictly personal, auto-written (memory auto-writes by design;
 * the KB does not). Procedural is the natural type for a routine, but the model may also surface a
 * stable semantic fact (e.g. "works primarily on the Acme account").
 */

export const MAX_OBSERVED = 3
export const PARSE_LIMIT = 10
/** Cap on routines fed to the model — keeps the prompt focused on the strongest patterns (dry-run found a
 *  single user can produce 30+ near-duplicate single-action routines, which is noise, not signal). */
export const MAX_ROUTINES_FED = 12
const MEM_TYPES: MemType[] = ['semantic', 'episodic', 'procedural']

export interface ObservedCandidate {
  memType: MemType
  content: string
  salience: number
}

export interface ObserveDistillDeps {
  /** Injected single-shot completion (the gpt-oss-20b call). */
  complete: (prompt: string) => Promise<string>
}

const norm = (s: string) => s.trim().toLowerCase()
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Parse one JSON object string, or null if malformed (used by the truncation-salvage path). */
function tryParseObject(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Human-readable one-liner for a routine, fed to the model (no raw signatures or ids leak in). */
export function describeRoutine(r: RoutineCandidate): string {
  const when = r.weekday !== null && r.weekday >= 0 && r.weekday <= 6
    ? `${DOW[r.weekday]}${r.hour !== null ? ` around ${String(r.hour).padStart(2, '0')}:00 UTC` : ''}`
    : r.hour !== null ? `around ${String(r.hour).padStart(2, '0')}:00 UTC` : 'recurring'
  return `${when}: ${r.sequence.join(' → ')} (seen on ${r.occurrences} days)`
}

/**
 * Order routines by signal strength for the model: multi-step sequences first (a real workflow), then
 * single-action ones; within each, by recurrence. Capped — the dry-run showed one user can yield 30+
 * near-duplicate single-action routines (`task.comment` across every weekday/hour bucket), which drowns
 * the genuine multi-step patterns. We surface the strongest and let the prompt reject the trivial.
 */
export function prioritizeRoutines(routines: RoutineCandidate[], cap = MAX_ROUTINES_FED): RoutineCandidate[] {
  return [...routines]
    .sort((a, b) => {
      const aMulti = a.sequence.length >= 2 ? 1 : 0
      const bMulti = b.sequence.length >= 2 ? 1 : 0
      if (aMulti !== bMulti) return bMulti - aMulti
      return b.occurrences - a.occurrences
    })
    .slice(0, cap)
}

export function buildObserveDistillPrompt(routines: RoutineCandidate[]): string {
  return [
    'You infer durable facts about how ONE employee works, from their recurring activity routines, to help a future assistant anticipate their work.',
    'Each line below is a routine: when it tends to happen and the ordered actions it involves.',
    'Return ONLY a JSON array (max 3) of objects: {"memType":"procedural|semantic","content":"...","salience":0..1}.',
    'procedural = a routine they follow (e.g. "reviews ad spend every Monday morning"); semantic = a stable fact (e.g. "primarily works on creative-proof approvals").',
    'Quality bar: only surface MEANINGFUL work routines. IGNORE trivial low-signal patterns (e.g. just commenting on or viewing tasks). A multi-step sequence is far more meaningful than a single repeated action.',
    'Consolidate fragments: if one action recurs across many weekday/hour buckets, describe the cadence generally ("most weekdays", "every Monday morning") — do NOT copy precise clock times or "UTC" into the memory.',
    'Write each content as a short, natural sentence about the person. Infer ONLY from the routines given — invent nothing, add no names, ids, or numbers not present.',
    'If nothing is genuinely worth remembering, return [].',
    '',
    ...routines.map(r => `- ${describeRoutine(r)}`)
  ].join('\n')
}

/**
 * Tolerant parse: locate the JSON array (even in prose), validate each item, default a bad memType to
 * 'procedural' (these come from routines), clamp salience 0..1, drop empties, cap at PARSE_LIMIT.
 */
export function parseObserveDistillResponse(text: string): ObservedCandidate[] {
  if (!text) return []

  let arr: unknown[] | null = null
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1))
      if (Array.isArray(parsed)) arr = parsed
    } catch { /* fall through to object salvage */ }
  }

  // Salvage path: a reasoning model can truncate mid-array (no closing ']') — recover each COMPLETE
  // top-level {...} object so a good-but-cut-off response isn't lost. Flat objects only (tags are []).
  if (!arr) {
    const objs = text.match(/\{[^{}]*\}/g) ?? []
    arr = objs.map(tryParseObject).filter(Boolean)
  }
  if (!arr.length) return []

  const out: ObservedCandidate[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rawContent = (item as Record<string, unknown>).content
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    if (!content) continue

    const rawType = (item as Record<string, unknown>).memType
    const memType: MemType = (typeof rawType === 'string' && (MEM_TYPES as string[]).includes(rawType))
      ? rawType as MemType
      : 'procedural'

    let salience = Number((item as Record<string, unknown>).salience)
    if (!Number.isFinite(salience)) salience = 0.5
    salience = Math.max(0, Math.min(1, salience))

    out.push({ memType, content, salience })
    if (out.length >= PARSE_LIMIT) break
  }
  return out
}

/**
 * Distil observed routines into memory candidates. Fail-safe: no routines → [] (no model call); any
 * completion error → []. Dedups against existing memory contents (case/space-insensitive). Caps at
 * MAX_OBSERVED after dedup so novel candidates aren't lost to earlier duplicates.
 */
export async function distillObserved(
  routines: RoutineCandidate[],
  existingContents: string[],
  deps: ObserveDistillDeps
): Promise<ObservedCandidate[]> {
  if (routines.length === 0) return []

  let raw: string
  try {
    raw = await deps.complete(buildObserveDistillPrompt(prioritizeRoutines(routines)))
  } catch {
    return []
  }

  const seen = new Set(existingContents.map(norm))
  const out: ObservedCandidate[] = []
  for (const c of parseObserveDistillResponse(raw)) {
    const key = norm(c.content)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= MAX_OBSERVED) break
  }
  return out
}
