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

  // 1. ILIKE pass — fast, deterministic, always works.
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
  } catch (error: any) {
    if (!error?.message?.includes('does not exist')) throw error
    return []
  }

  // 2. Semantic pass — only when Vectorize is reachable. No-op when not
  //    (searchSimilar returns []). Skip users already matched via ILIKE.
  try {
    const semantic = await searchSimilar(haystack, SEMANTIC_TOP_K)
    for (const hit of semantic) {
      if (hit.score < SEMANTIC_SIMILARITY_THRESHOLD) continue
      const userId = (hit.metadata?.userId as string | undefined) || null
      const keyword = (hit.metadata?.keyword as string | undefined) || null
      if (!userId || !keyword) continue
      if (seenUsers.has(userId)) continue
      // Only consume vectors that look like keyword subscriptions.
      if (!hit.id.startsWith('kw_')) continue
      matches.push({ userId, keyword, mode: 'semantic' })
      seenUsers.add(userId)
    }
  } catch (err) {
    console.error('[keywords] Semantic match failed (continuing with ILIKE-only):', err)
  }

  return matches
}
