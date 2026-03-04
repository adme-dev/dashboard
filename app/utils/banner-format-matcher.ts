import { FORMATS } from '~/utils/banner-constants'

export interface FormatMatch {
  key: string
  name: string
  w: number
  h: number
  matchType: 'exact' | 'aspect' | 'custom'
}

/**
 * Match image dimensions to the closest known ad format.
 * Strategy: exact match → aspect ratio match (5% tolerance) → custom fallback.
 */
export function matchImageToFormat(imgW: number, imgH: number): FormatMatch {
  // 1. Exact match
  for (const fmt of Object.values(FORMATS)) {
    if (fmt.w === imgW && fmt.h === imgH) {
      return { key: fmt.key, name: fmt.name, w: fmt.w, h: fmt.h, matchType: 'exact' }
    }
  }

  // 2. Aspect ratio match — find closest standard size within 5% tolerance
  const imgAspect = imgW / imgH
  let bestMatch: FormatMatch | null = null
  let bestDiff = Infinity

  for (const fmt of Object.values(FORMATS)) {
    const fmtAspect = fmt.w / fmt.h
    const aspectDiff = Math.abs(imgAspect - fmtAspect) / fmtAspect
    if (aspectDiff < 0.05) {
      // Prefer the format closest in total pixel count
      const sizeDiff = Math.abs((imgW * imgH) - (fmt.w * fmt.h))
      if (sizeDiff < bestDiff) {
        bestDiff = sizeDiff
        bestMatch = { key: fmt.key, name: fmt.name, w: fmt.w, h: fmt.h, matchType: 'aspect' }
      }
    }
  }

  if (bestMatch) return bestMatch

  // 3. Custom — no match found
  return {
    key: `custom_${imgW}x${imgH}`,
    name: `Custom (${imgW}x${imgH})`,
    w: imgW,
    h: imgH,
    matchType: 'custom',
  }
}
