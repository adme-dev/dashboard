/**
 * Each explicit attempt gets a new execution key. Draft creation itself is
 * serialized and deduplicated by render job in the database, so retrying after
 * a lost response reopens the same post without replaying a failed execution.
 */
export function createBannerSocialDraftSession(nextKey = () => `banner-social-draft:${globalThis.crypto.randomUUID()}`) {
  return {
    attempt<T>(send: (headers: Record<string, string>) => Promise<T>): Promise<T> {
      return send({ 'Idempotency-Key': nextKey() })
    }
  }
}
