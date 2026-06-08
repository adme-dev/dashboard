/**
 * Classify a transcribed confirmation utterance in voice mode. Only an explicit affirmative
 * executes a guarded write; everything ambiguous is treated as "not confirmed" (safe default).
 */
export type ConfirmIntent = 'affirmative' | 'negative' | 'stop' | 'ambiguous'

// Multi-word session-stop phrases are checked FIRST (so "stop listening" is a stop, not a negative).
const STOP_PHRASES = ['stop listening', 'stop voice', 'end session', 'exit voice', 'goodbye']
const AFFIRMATIVE = [
  'confirm', 'confirmed', 'yes', 'yep', 'yeah', 'yup', 'do it', 'go ahead',
  'proceed', 'approve', 'approved', 'please do', 'sounds good'
]
const NEGATIVE = [
  'cancel', 'no', 'nope', 'nah', 'don\'t', 'do not', 'abort',
  'never mind', 'nevermind', 'stop', 'forget it', 'discard'
]

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** word-boundary containment so "no" doesn't match "snow" but "yes please" matches "yes". */
function hasPhrase(text: string, phrase: string): boolean {
  if (text === phrase) return true
  return new RegExp(`(^|\\s)${escapeRegex(phrase)}(\\s|$)`).test(text)
}

export function classifyConfirmUtterance(raw: string): ConfirmIntent {
  const t = normalize(raw)
  if (!t) return 'ambiguous'
  if (STOP_PHRASES.some(p => hasPhrase(t, p))) return 'stop'
  if (AFFIRMATIVE.some(p => hasPhrase(t, p))) return 'affirmative'
  if (NEGATIVE.some(p => hasPhrase(t, p))) return 'negative'
  return 'ambiguous'
}
