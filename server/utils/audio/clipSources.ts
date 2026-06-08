// server/utils/audio/clipSources.ts — PURE. Collect the distinct R2 keys the audio
// engine will actually request for a timeline: clips of NON-muted tracks only (the
// planner drops muted tracks, so their buffers are never resolved). The clip-sources
// endpoint presigns exactly these keys — nothing else (no arbitrary-key presign).
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

export function collectClipKeys(timeline: TimelineState): string[] {
  const keys = new Set<string>()
  for (const track of timeline.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      const key = (clip as { r2_key?: string }).r2_key
      if (key) keys.add(key)   // overlay clips have no r2_key — skip them
    }
  }
  return [...keys]
}
