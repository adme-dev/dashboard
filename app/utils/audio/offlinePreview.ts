// app/utils/audio/offlinePreview.ts — Tier-1, NON-authoritative in-browser mixdown
// for instant scrub/preview. Reuses the pure planner so preview matches live
// playback; the ffmpeg render (SP1) remains the source of truth (browser resamplers
// drift per machine — brief §5). OfflineAudioContext is injectable for tests.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, dbToGain, type ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

export async function renderPreview(
  state: TimelineState,
  resolveBuffer: (clip: ScheduledClip) => Promise<any>,
  OfflineCtor: any = (globalThis as any).OfflineAudioContext
): Promise<any> {
  const plan = planTimeline(state)

  // Resolve buffers + compute total duration (fill null clip durations from buffers).
  const buffers = new Map<string, any>()
  let durationSec = 0
  for (const clip of plan.clips) {
    const buf = await resolveBuffer(clip)
    buffers.set(clip.clipId, buf)
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    durationSec = Math.max(durationSec, clip.timelineStartSec + dur)
  }

  const sampleRate = state.sample_rate
  const length = Math.max(1, Math.ceil(durationSec * sampleRate))
  const ctx: any = new OfflineCtor(2, length, sampleRate)

  const trackBus = new Map<string, any>()
  for (const t of plan.tracks) {
    const bus = ctx.createGain()
    bus.gain.value = dbToGain(t.gainDb)
    bus.connect(ctx.destination)
    trackBus.set(t.trackId, bus)
  }

  for (const clip of plan.clips) {
    const buf = buffers.get(clip.clipId)
    if (!buf) continue
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    const when = clip.timelineStartSec
    const src = ctx.createBufferSource()
    src.buffer = buf
    const clipGain = ctx.createGain()
    const target = dbToGain(clip.gainDb)
    if (clip.fadeInSec > 0) {
      clipGain.gain.setValueAtTime(0, when)
      clipGain.gain.linearRampToValueAtTime(target, when + clip.fadeInSec)
    } else {
      clipGain.gain.setValueAtTime(target, when)
    }
    if (clip.fadeOutSec > 0) {
      clipGain.gain.setValueAtTime(target, when + Math.max(0, dur - clip.fadeOutSec))
      clipGain.gain.linearRampToValueAtTime(0, when + dur)
    }
    src.connect(clipGain)
    clipGain.connect(trackBus.get(clip.trackId) ?? ctx.destination)
    src.start(when, clip.sourceInSec, dur)
  }

  for (const r of plan.ramps) {
    const bus = trackBus.get(r.targetTrackId)
    if (bus) bus.gain.linearRampToValueAtTime(dbToGain(r.toGainDb), r.atSec + r.rampSec)
  }

  return ctx.startRendering()
}
