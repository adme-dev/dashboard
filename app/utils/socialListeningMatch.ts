// app/utils/socialListeningMatch.ts
// Pure helpers for Social Listening (client + server safe). No I/O.

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'unknown'

/** Keep text iff it contains at least one include term and no exclude term (case-insensitive). */
export function matchesQuery(text: string, include: string[], exclude: string[]): boolean {
  const hay = (text || '').toLowerCase()
  const inc = include.map(t => t.trim().toLowerCase()).filter(Boolean)
  if (inc.length === 0) return false
  if (!inc.some(t => hay.includes(t))) return false
  const exc = exclude.map(t => t.trim().toLowerCase()).filter(Boolean)
  return !exc.some(t => hay.includes(t))
}

/** Bucket a numeric sentiment score (e.g. inbox `sentiment NUMERIC`) into a label. */
export function bucketSentiment(value: number | null | undefined): Sentiment {
  if (value == null || Number.isNaN(value)) return 'unknown'
  if (value > 0.2) return 'positive'
  if (value < -0.2) return 'negative'
  return 'neutral'
}
