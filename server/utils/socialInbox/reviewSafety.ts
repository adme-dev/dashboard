/** Historical imports remain visible for staff, but never trigger unsolicited old replies. */
export function isRecentReview(timestamp: string | null | undefined, now = Date.now()): boolean {
  if (!timestamp) return false
  const time = new Date(timestamp).getTime()
  return Number.isFinite(time) && time <= now && now - time <= 24 * 60 * 60 * 1000
}

export function isLowReviewRating(rating: number | null | undefined): boolean {
  return Number.isInteger(rating) && rating! >= 1 && rating! <= 3
}
