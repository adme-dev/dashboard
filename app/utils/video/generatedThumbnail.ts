// generatedThumbnail.ts — PURE helpers for choosing a representative poster
// frame from a generated clip. AI clips often fade in from black, so frame 0
// (or `#t=0.1`) is usually an unhelpful dark tile. We sample a few interior
// timestamps and, when pixels are readable, prefer the first frame that is not
// near-black. When pixels are not readable (cross-origin storage without CORS
// taints the canvas) the midpoint frame is still far more representative than
// the opening frame.

/** Mean luma (0–255) at or below which a frame is treated as "dark". */
export const DARK_FRAME_LUMA = 24

/** Fallback when the clip reports no usable duration. */
const FALLBACK_DURATION_SEC = 5

/**
 * Interior sample times, most representative first: 50%, 30%, 70%, 15%.
 * Each is clamped away from both ends so a fade-in or fade-out never wins by
 * default. Duplicates (very short clips) are removed.
 */
export function thumbnailCandidateTimes(durationSec: number | null | undefined): number[] {
  const duration = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : FALLBACK_DURATION_SEC
  const edge = Math.min(0.25, duration / 4)
  const clamp = (t: number) => Math.min(Math.max(t, edge), Math.max(edge, duration - edge))
  const times = [0.5, 0.3, 0.7, 0.15].map(fraction => Math.round(clamp(duration * fraction) * 100) / 100)
  return [...new Set(times)]
}

/** Mean Rec. 601 luma of an RGBA pixel buffer, sampling every `stride`th pixel. */
export function averageLuma(data: ArrayLike<number>, stride = 4): number {
  const step = Math.max(1, Math.floor(stride)) * 4
  let total = 0
  let count = 0
  for (let i = 0; i + 2 < data.length; i += step) {
    total += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
    count++
  }
  return count ? total / count : 0
}

export function isDarkFrame(luma: number, threshold = DARK_FRAME_LUMA): boolean {
  return luma <= threshold
}

export interface ThumbnailFrameSample {
  timeSec: number
  /** null when pixels could not be read (tainted canvas, decode failure). */
  luma: number | null
}

export interface ThumbnailFrameChoice {
  timeSec: number
  /** true only when every readable sample was dark — the UI says so honestly. */
  dark: boolean
  /** false when no sample's pixels were readable; brightness is unverified. */
  verified: boolean
}

/**
 * Pick the poster frame. The first non-dark readable sample wins; if every
 * readable sample is dark, the brightest one is shown and flagged `dark`; if
 * nothing was readable, the first candidate (midpoint) is used unverified.
 */
export function pickThumbnailFrame(samples: ThumbnailFrameSample[]): ThumbnailFrameChoice | null {
  if (!samples.length) return null
  const readable = samples.filter((sample): sample is { timeSec: number, luma: number } => typeof sample.luma === 'number')
  if (!readable.length) return { timeSec: samples[0]!.timeSec, dark: false, verified: false }
  const bright = readable.find(sample => !isDarkFrame(sample.luma))
  if (bright) return { timeSec: bright.timeSec, dark: false, verified: true }
  const brightest = readable.reduce((best, next) => (next.luma > best.luma ? next : best))
  return { timeSec: brightest.timeSec, dark: true, verified: true }
}
