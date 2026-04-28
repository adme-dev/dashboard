/**
 * Keyword subscription matching.
 *
 * On every board notification dispatch, we look up which users have keywords
 * matching the title or message and create an extra notification for them
 * with reason='direct'. Idempotent — duplicates are tolerated since
 * notifications are append-only.
 *
 * Phase E1: text ILIKE match. Future iteration replaces with Vectorize ANN.
 */
import { queryRows } from '~~/server/utils/db'

export interface KeywordMatchInput {
  title: string
  message: string
  excludeUserIds?: string[]
}

export interface KeywordMatch {
  userId: string
  keyword: string
}

/**
 * Find users whose keyword subscriptions match the given text.
 * Returns at most one match per user (the first matching keyword).
 */
export async function findKeywordMatches(input: KeywordMatchInput): Promise<KeywordMatch[]> {
  const haystack = `${input.title} ${input.message}`
  if (!haystack.trim()) return []

  try {
    // Pull all keyword subs and match in app — full-table scan is fine until
    // we hit ~10k subscriptions. At that point we can switch to a tsquery.
    const rows = await queryRows(
      `SELECT user_id, keyword FROM keyword_subscriptions`
    )

    const lowerHaystack = haystack.toLowerCase()
    const seenUsers = new Set<string>(input.excludeUserIds || [])
    const matches: KeywordMatch[] = []
    for (const r of rows) {
      if (seenUsers.has(r.user_id)) continue
      if (lowerHaystack.includes(String(r.keyword).toLowerCase())) {
        matches.push({ userId: r.user_id, keyword: r.keyword })
        seenUsers.add(r.user_id)
      }
    }
    return matches
  } catch (error: any) {
    if (error?.message?.includes('does not exist')) return []
    throw error
  }
}
