/**
 * Detects when the user starts talking over the assistant's playback (barge-in). The threshold is
 * deliberately higher than the recording silence threshold (0.015) to reject residual echo that
 * leaks past the browser's echo cancellation. Pure: time is injected, no timers, fully testable.
 */
export interface BargeInDetector {
  /** Feed an RMS sample (0..1) at time `nowMs`. Returns true once speech is sustained >= sustainMs. */
  sample(rms: number, nowMs: number): boolean
  reset(): void
}

export function createBargeInDetector(opts: { threshold?: number, sustainMs?: number } = {}): BargeInDetector {
  const threshold = opts.threshold ?? 0.08
  const sustainMs = opts.sustainMs ?? 300
  let aboveSince: number | null = null
  return {
    sample(rms, nowMs) {
      if (rms >= threshold) {
        if (aboveSince === null) aboveSince = nowMs
        return nowMs - aboveSince >= sustainMs
      }
      aboveSince = null
      return false
    },
    reset() { aboveSince = null },
  }
}
