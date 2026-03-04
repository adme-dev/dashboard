/**
 * Maps banner aspect ratios to Meta ad placements.
 */

export const ASPECT_TO_PLACEMENTS: Record<string, string[]> = {
  '1:1':  ['Feed', 'Marketplace', 'Search Results'],
  '4:5':  ['Feed', 'Marketplace'],
  '9:16': ['Stories', 'Reels', 'In-Stream'],
  '16:9': ['Feed', 'Right Column', 'Search Results'],
}

/** Reduce w/h to a simplified ratio string like '1:1', '4:5', etc. */
export function getAspectRatio(w: number, h: number): string {
  if (!w || !h) return 'unknown'

  const ratio = w / h
  // Exact match thresholds with some tolerance (± 3%)
  if (Math.abs(ratio - 1) < 0.03) return '1:1'
  if (Math.abs(ratio - 4 / 5) < 0.03) return '4:5'
  if (Math.abs(ratio - 9 / 16) < 0.03) return '9:16'
  if (Math.abs(ratio - 16 / 9) < 0.03) return '16:9'

  // Close matches — cover the full range so no ratio falls through
  if (ratio >= 1.5) return '16:9'
  if (ratio > 1.1) return '16:9'  // 1.1-1.5 range (e.g. 4:3) → closest standard
  if (ratio >= 0.9) return '1:1'
  if (ratio >= 0.7) return '4:5'
  return '9:16'
}

/** Get suggested Meta placements for a banner of given dimensions */
export function getMetaPlacements(w: number, h: number): string[] {
  const ratio = getAspectRatio(w, h)
  return ASPECT_TO_PLACEMENTS[ratio] || ['Feed']
}
