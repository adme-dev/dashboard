export interface RawDraft {
  content: string
  variants: Record<string, string>
  hashtags: string[]
}

/** Parse the model's JSON response into clean draft rows. Tolerant of ```json fences; [] on garbage. */
export function parsePlanDrafts(raw: string): RawDraft[] {
  const cleaned = String(raw ?? '').replace(/```json/gi, '').replace(/```/g, '').trim()
  let parsed: any
  try { parsed = JSON.parse(cleaned) } catch { return [] }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : []
  const out: RawDraft[] = []
  for (const p of list) {
    if (!p || typeof p.content !== 'string' || !p.content.trim()) continue
    out.push({
      content: p.content.trim(),
      variants: (p.variants && typeof p.variants === 'object') ? p.variants : {},
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h: any) => typeof h === 'string') : [],
    })
  }
  return out
}

/** Evenly distribute `count` ISO timestamps across (fromISO, toISO]. Deterministic; no Date.now(). */
export function spreadSchedule(count: number, fromISO: string, toISO: string): string[] {
  if (count <= 0) return []
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  const span = to - from
  return Array.from({ length: count }, (_, i) =>
    new Date(from + Math.round((span * (i + 1)) / (count + 1))).toISOString(),
  )
}
