import type { MemType } from './types'

/**
 * Inferred memory distillation (Phase-0 WS-A.7, memory-architecture spec §5.2).
 *
 * After a turn, a cheap model (gpt-oss-20b) proposes ≤3 durable memories. PURE prompt + tolerant
 * parser + injected `complete` so it's unit-tested without a model. Fire-and-forget at the call site
 * (never blocks the response) and gated by `AI_MEMORY_DISTILL_ENABLED` — this module is the logic
 * only; the flag check + persistence live in the orchestration (WS-A.8).
 *
 * Conservative by design: malformed output → [] (no crash, no retry storm); dedups against existing
 * memories; hard cap of 3 per turn to avoid memory pollution.
 */

export const MAX_CANDIDATES = 3
const MEM_TYPES: MemType[] = ['semantic', 'episodic', 'procedural']

export interface TurnForDistill {
  userMessage: string
  assistantMessage: string
}

export interface MemoryCandidate {
  memType: MemType
  content: string
  salience: number
}

export interface DistillDeps {
  /** Injected single-shot completion (the gpt-oss-20b call). */
  complete: (prompt: string) => Promise<string>
}

const norm = (s: string) => s.trim().toLowerCase()

export function buildDistillPrompt(turn: TurnForDistill): string {
  return [
    'You extract durable, reusable facts about THIS user from one chat turn, to help future sessions.',
    'Return ONLY a JSON array (max 3) of objects: {"memType":"semantic|episodic|procedural","content":"...","salience":0..1}.',
    'semantic = a stable fact/preference; episodic = something that happened; procedural = a routine they follow.',
    'Only include things worth remembering long-term. If nothing is worth keeping, return [].',
    'Do NOT include secrets, credentials, or one-off trivia.',
    '',
    `User: ${turn.userMessage}`,
    `Assistant: ${turn.assistantMessage}`,
  ].join('\n')
}

/**
 * Tolerant parse: locate the JSON array (even if wrapped in prose), validate each item, default a
 * bad memType to 'semantic', clamp salience to 0..1, drop empties, cap at MAX_CANDIDATES.
 */
export function parseDistillResponse(text: string): MemoryCandidate[] {
  if (!text) return []
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []

  let arr: unknown
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []

  const out: MemoryCandidate[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rawContent = (item as Record<string, unknown>).content
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    if (!content) continue

    const rawType = (item as Record<string, unknown>).memType
    const memType: MemType = (typeof rawType === 'string' && (MEM_TYPES as string[]).includes(rawType))
      ? rawType as MemType
      : 'semantic'

    let salience = Number((item as Record<string, unknown>).salience)
    if (!Number.isFinite(salience)) salience = 0.5
    salience = Math.max(0, Math.min(1, salience))

    out.push({ memType, content, salience })
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

/**
 * Run distillation: prompt → injected completion → parse → dedup against existing memory contents.
 * Fail-safe: any completion error yields [] (the turn is unaffected). Returns the candidates to save.
 */
export async function distill(turn: TurnForDistill, existingContents: string[], deps: DistillDeps): Promise<MemoryCandidate[]> {
  let raw: string
  try {
    raw = await deps.complete(buildDistillPrompt(turn))
  } catch {
    return []
  }

  const seen = new Set(existingContents.map(norm))
  const out: MemoryCandidate[] = []
  for (const c of parseDistillResponse(raw)) {
    const key = norm(c.content)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}
