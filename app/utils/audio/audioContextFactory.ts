// app/utils/audio/audioContextFactory.ts — browser-only real collaborators for the
// SP2a engine. createBrowserAudioContext + browserSetTimer are thin prod wrappers
// (manual-verified); makeR2Resolver is the unit-tested core: it turns a clip's r2_key
// into a decoded AudioBuffer via a presigned URL (clip-sources endpoint). The engine
// API is unchanged — these are just the real values injected into createAudioEngine.
import { AudioContext } from 'standardized-audio-context'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

/** A suspended real AudioContext (resumed on the user's first Play — autoplay policy). */
export function createBrowserAudioContext(sampleRate?: number): AudioContext {
  return new AudioContext(sampleRate ? { sampleRate } : undefined)
}

/** setTimeout wrapper → cancel fn. The engine's lookahead-loop timer in production. */
export function browserSetTimer(cb: () => void, ms: number): () => void {
  const id = setTimeout(cb, ms)
  return () => clearTimeout(id)
}

/** Build a resolveBuffer over a LIVE { r2_key → presigned URL } map: fetch → arrayBuffer →
 * decodeAudioData. Caches by r2_key (clips sharing a source fetch+decode once).
 * Rejects if a clip's key is absent (the editor surfaces it as a hard load error).
 *
 * The resolver reads `clipSources` on EVERY call (not a snapshot) so that newly
 * added clip URLs merged in after init (via mergeSource in the editor composable)
 * are immediately visible without rebuilding the resolver. */
export function makeR2Resolver(
  clipSources: Map<string, string>,
  ctx: Pick<AudioContext, 'decodeAudioData'>
): (clip: ScheduledClip) => Promise<AudioBuffer> {
  const cache = new Map<string, Promise<AudioBuffer>>()
  return (clip: ScheduledClip) => {
    const url = clipSources.get(clip.r2_key)
    if (!url) return Promise.reject(new Error(`No source URL for clip ${clip.clipId} (key ${clip.r2_key})`))
    let p = cache.get(clip.r2_key)
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Fetch failed (${r.status}) for ${clip.r2_key}`)
          return r.arrayBuffer()
        })
        .then((ab) => ctx.decodeAudioData(ab) as Promise<AudioBuffer>)
      cache.set(clip.r2_key, p)
    }
    return p
  }
}
