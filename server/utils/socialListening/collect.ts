// server/utils/socialListening/collect.ts
// Pure orchestrator: run one listening query against the enabled+selected sources, apply the
// query's include/exclude matching, and return deduped RawMentions. Deps injected (fetch, env,
// the source list) so it's fully unit-testable. One source throwing must not sink the batch.
import { matchesQuery } from '~~/app/utils/socialListeningMatch'
import type { ListeningSource, SourceEnv } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

export interface QueryLike {
  include_terms: string[]
  exclude_terms: string[]
  sources: string[]
}

const PER_SOURCE_LIMIT = 25

export async function collectForQuery(
  query: QueryLike, sources: ListeningSource[], env: SourceEnv, fetchImpl: typeof fetch,
): Promise<RawMention[]> {
  const selected = new Set(query.sources ?? [])
  const active = sources.filter(s => selected.has(s.key) && s.isEnabled(env))
  const out: RawMention[] = []
  const seen = new Set<string>()
  for (const src of active) {
    let hits: RawMention[] = []
    try {
      hits = await src.search({ terms: query.include_terms, limit: PER_SOURCE_LIMIT, fetchImpl, env })
    } catch (err) {
      console.error('listening.source.error', { source: src.key, error: String(err) })
      continue
    }
    for (const h of hits) {
      const text = `${h.title ?? ''} ${h.content ?? ''}`
      if (!matchesQuery(text, query.include_terms, query.exclude_terms)) continue
      const dedupeKey = `${h.source}:${h.externalId}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out.push(h)
    }
  }
  return out
}
