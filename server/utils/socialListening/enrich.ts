// server/utils/socialListening/enrich.ts
// Groq enrichment for listening mentions: classify sentiment + topics. Pure prompt builder +
// tolerant JSON parser (fail-safe) + an injected orchestrator. Mirrors socialReporting/aiSummary
// posture: any LLM/parse failure degrades to 'unknown', never throws into the cron.
import type { Sentiment } from '~~/app/utils/socialListeningMatch'

export interface EnrichInput { id: string; text: string }
export interface EnrichResult { sentiment: Sentiment; topics: string[] }
const VALID: Sentiment[] = ['positive', 'neutral', 'negative', 'unknown']

/** Pure: build the batch classification prompt. */
export function buildEnrichmentPrompt(items: EnrichInput[]): string {
  const lines = items.map(i => `- id ${i.id}: ${(i.text || '').slice(0, 400).replace(/\s+/g, ' ')}`)
  return [
    'Classify each social mention below for sentiment and up to 5 short topic tags.',
    'Sentiment must be exactly one of: positive, neutral, negative.',
    'Respond with ONLY a JSON array, one object per mention, no prose:',
    '[{"id":"<id>","sentiment":"positive|neutral|negative","topics":["tag1","tag2"]}]',
    '',
    'Mentions:',
    ...lines,
  ].join('\n')
}

/** Pure: parse the LLM response into a map. Tolerant of code fences / prose. Fail-safe → {}. */
export function parseEnrichmentResponse(text: string): Record<string, EnrichResult> {
  const out: Record<string, EnrichResult> = {}
  if (!text) return out
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return out
  let arr: any
  try { arr = JSON.parse(text.slice(start, end + 1)) } catch { return out }
  if (!Array.isArray(arr)) return out
  for (const row of arr) {
    const id = row?.id != null ? String(row.id) : ''
    if (!id) continue
    const s = String(row?.sentiment ?? '').toLowerCase() as Sentiment
    const sentiment: Sentiment = (VALID.includes(s) && s !== 'unknown') ? s : 'unknown'
    const topics: string[] = Array.isArray(row?.topics)
      ? [...new Set<string>(row.topics.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 5)
      : []
    out[id] = { sentiment, topics }
  }
  return out
}

export interface EnrichDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}
export type GroqFn = (prompt: string) => Promise<string>

/**
 * Enrich a batch of un-enriched mentions. On a successful Groq call every row in the batch is
 * stamped enriched_at (sentiment from the parse, else 'unknown') so it is not retried forever; on
 * a Groq exception nothing is stamped (retried next run). Returns the number of rows enriched.
 */
export async function enrichUnenriched(db: EnrichDbRunner, groq: GroqFn, batchSize = 20): Promise<number> {
  const rows = await db.queryRows<{ id: string; title: string | null; content: string | null }>(
    `SELECT id, title, content FROM social_listening_mentions
       WHERE enriched_at IS NULL ORDER BY created_at ASC LIMIT $1`, [batchSize])
  if (!rows.length) return 0
  const items: EnrichInput[] = rows.map(r => ({ id: r.id, text: `${r.title ?? ''} ${r.content ?? ''}`.trim() }))
  let parsed: Record<string, EnrichResult>
  try {
    parsed = parseEnrichmentResponse(await groq(buildEnrichmentPrompt(items)))
  } catch {
    return 0
  }
  let n = 0
  for (const r of rows) {
    const res = parsed[r.id] ?? { sentiment: 'unknown' as Sentiment, topics: [] }
    await db.execute(
      `UPDATE social_listening_mentions SET sentiment = $1, topics = $2, enriched_at = NOW() WHERE id = $3`,
      [res.sentiment, res.topics, r.id])
    n++
  }
  return n
}
