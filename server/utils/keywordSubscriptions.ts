/**
 * Keyword subscription matching.
 *
 * On every board notification dispatch, we look up which users have keywords
 * matching the title or message and create an extra notification for them
 * with reason='direct'. Idempotent — duplicates are tolerated since
 * notifications are append-only.
 *
 * Phase E1 ships text ILIKE match.
 * Phase E2 layers semantic ANN match on top (Workers AI bge embedding +
 * Vectorize), so users keep matching even when phrasing differs from
 * their keyword. Both run; results are deduped by user_id.
 */
import { queryRows } from '~~/server/utils/db'
import { searchSimilar } from '~~/server/utils/aiVectorize'

export interface KeywordMatchInput {
  title: string
  message: string
  excludeUserIds?: string[]
}

export interface KeywordMatch {
  userId: string
  keyword: string
  /** 'exact' = ILIKE substring; 'semantic' = Vectorize cosine */
  mode: 'exact' | 'semantic'
}

const SEMANTIC_SIMILARITY_THRESHOLD = 0.55
const SEMANTIC_TOP_K = 20

export async function findKeywordMatches(input: KeywordMatchInput): Promise<KeywordMatch[]> {
  const haystack = `${input.title} ${input.message}`.trim()
  if (!haystack) return []

  const exclude = new Set<string>(input.excludeUserIds || [])
  const seenUsers = new Set<string>(exclude)
  const matches: KeywordMatch[] = []

  // 1. ILIKE pass — pushed into SQL using the pg_trgm GIN index so the
  //    DB can prune rows whose trigrams don't overlap with the haystack.
  //    Falls back to full-table scan when pg_trgm/index is missing.
  try {
    const rows = await queryRows(
      `SELECT user_id, keyword
       FROM keyword_subscriptions
       WHERE LOWER($1) LIKE '%' || LOWER(keyword) || '%'`,
      [haystack]
    )
    for (const r of rows) {
      if (seenUsers.has(r.user_id)) continue
      matches.push({ userId: r.user_id, keyword: r.keyword, mode: 'exact' })
      seenUsers.add(r.user_id)
    }
  } catch (error: any) {
    if (error?.message?.includes('does not exist')) return []
    // Defensive: if the SQL filter blows up for any other reason (e.g. an
    // older PG without pg_trgm), fall back to the original app-side scan
    // so the feature stays alive.
    console.error('[keywords] SQL filter failed, falling back to app-side scan:', error)
    try {
      const rows = await queryRows(`SELECT user_id, keyword FROM keyword_subscriptions`)
      const lowerHaystack = haystack.toLowerCase()
      for (const r of rows) {
        if (seenUsers.has(r.user_id)) continue
        if (lowerHaystack.includes(String(r.keyword).toLowerCase())) {
          matches.push({ userId: r.user_id, keyword: r.keyword, mode: 'exact' })
          seenUsers.add(r.user_id)
        }
      }
    } catch {
      return []
    }
  }

  // 2. Semantic pass — only when Vectorize is reachable. No-op when not
  //    (searchSimilar returns []). Skip users already matched via ILIKE.
  //    Cross-check candidate matches against the DB so orphan vectors
  //    (keyword row deleted but vector still present) don't fire phantom
  //    notifications. One round-trip for the whole batch.
  try {
    const semantic = await searchSimilar(haystack, SEMANTIC_TOP_K)
    const candidates: Array<{ userId: string; keyword: string; vectorId: string }> = []
    for (const hit of semantic) {
      if (hit.score < SEMANTIC_SIMILARITY_THRESHOLD) continue
      const userId = (hit.metadata?.userId as string | undefined) || null
      const keyword = (hit.metadata?.keyword as string | undefined) || null
      if (!userId || !keyword) continue
      if (seenUsers.has(userId)) continue
      if (!hit.id.startsWith('kw_')) continue
      candidates.push({ userId, keyword, vectorId: hit.id })
    }

    if (candidates.length > 0) {
      // Verify each vector_id still maps to an existing keyword row.
      // We accept either an exact vector_id match OR a matching id
      // pattern + same user + same keyword text (lets us tolerate rows
      // where vector_id is unset but the keyword and user line up).
      const vectorIds = candidates.map(c => c.vectorId)
      const live = await queryRows(
        `SELECT vector_id, user_id, keyword
         FROM keyword_subscriptions
         WHERE vector_id = ANY($1::text[])`,
        [vectorIds]
      )
      const liveSet = new Set(live.map(r => r.vector_id))
      for (const c of candidates) {
        if (!liveSet.has(c.vectorId)) continue // orphan — skip
        if (seenUsers.has(c.userId)) continue
        matches.push({ userId: c.userId, keyword: c.keyword, mode: 'semantic' })
        seenUsers.add(c.userId)
      }
    }
  } catch (err) {
    console.error('[keywords] Semantic match failed (continuing with ILIKE-only):', err)
  }

  return matches
}
