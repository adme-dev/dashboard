// server/utils/audio/musicGuard.ts
// Meta bans AI-generated audio that mimics a specific copyrighted artist's
// voice/style. A brief that says "in the style of <artist>" is a takedown +
// account-flag risk. Two passes: cheap pattern/blocklist first, optional AI
// backstop second. The AI pass can only ADD violations, never clear a clean
// pattern result. Used advisory for voiceover; a hard gate for music (Phase 2).

export interface GuardResult {
  safe: boolean
  violations: string[]
  sanitized: string
}

// Starter blocklist — back this with a KV-stored set in production (see
// loadBlocklist). Illustrative only.
const ARTIST_BLOCKLIST = [
  'taylor swift', 'beyonce', 'beyoncé', 'drake', 'the weeknd', 'ed sheeran',
  'billie eilish', 'sabrina carpenter', 'kendrick lamar', 'sia', 'adele',
]

const STYLE_CLAUSE =
  /\b(?:in the style of|sounds? like|similar to|inspired by|reminiscent of|a la|à la|mimic(?:king)?|imitat\w+|cover of|rip[- ]?off of)\b\s+([^.,;]+)/gi

export function guardAudioPrompt(prompt: string, blocklist: string[] = ARTIST_BLOCKLIST): GuardResult {
  const violations: string[] = []
  let sanitized = prompt

  // 1. Strip "<clause> <reference>" constructions.
  sanitized = sanitized.replace(STYLE_CLAUSE, (_m, ref: string) => {
    violations.push(ref.trim())
    return ''
  })

  // 2. Bare artist-name mentions anywhere. Match whole words only (so 'sia'
  // does not fire inside 'Russia') and regex-escape the name (so a blocklist
  // entry with metacharacters can't break or mis-match). Lookarounds on letters
  // rather than \b keep accented names (e.g. 'beyoncé') matchable.
  for (const name of blocklist) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![a-z])${esc}(?![a-z])`, 'gi')
    const replaced = sanitized.replace(re, '')
    if (replaced !== sanitized) {
      violations.push(name)
      sanitized = replaced
    }
  }

  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim()
  return { safe: violations.length === 0, violations, sanitized }
}

/**
 * Load the blocklist from KV (`CACHE` binding, key `audio:artist-blocklist`),
 * falling back to the inline starter list. Returns the inline list when KV is
 * unavailable (local dev). Never throws.
 */
export async function loadBlocklist(
  kv: { get(key: string, type: 'json'): Promise<unknown> } | null,
): Promise<string[]> {
  if (!kv) return ARTIST_BLOCKLIST
  try {
    const stored = await kv.get('audio:artist-blocklist', 'json')
    if (Array.isArray(stored) && stored.every(s => typeof s === 'string') && stored.length > 0) {
      return stored as string[]
    }
  } catch {
    // KV hiccup must not block generation — fall back to the inline list.
  }
  return ARTIST_BLOCKLIST
}
