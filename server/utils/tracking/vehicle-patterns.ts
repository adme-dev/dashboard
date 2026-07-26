/**
 * Vehicle-detail-page URL detection — server-side mirror of public/track.js's
 * getVehicleContext(). Kept as a separate TS module (rather than importing
 * the plain-JS tag directly) so the agency test-URL diagnostic tool can
 * reason about the exact same rules a real visitor's browser would apply.
 * If you change the pattern list or the stock-number regex here, change them
 * identically in public/track.js's VEHICLE_PAGE_PATTERNS / STOCK_NUMBER_RE.
 */

export const VEHICLE_PAGE_PATTERNS: readonly string[] = [
  'vehicle-for-sale', 'vehicles', 'cars-for-sale', 'cars',
  'inventory', 'vdp', 'stock', 'vehicle-details'
]

const STOCK_NUMBER_RE = /-(?:s|stock)-?(\d{3,})$/i

export interface VehiclePatternMatch {
  matched: boolean
  pattern: string | null
}

export function matchesVehiclePatterns(pathname: string, customPatterns: readonly string[]): VehiclePatternMatch {
  const all = [...VEHICLE_PAGE_PATTERNS, ...customPatterns]
  for (const pattern of all) {
    if (!pattern) continue
    if (pathname.includes(`/${pattern}/`)) {
      return { matched: true, pattern }
    }
  }
  return { matched: false, pattern: null }
}

export function extractStockNumber(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return null
  const match = STOCK_NUMBER_RE.exec(segments[segments.length - 1]!)
  return match ? match[1]! : null
}
