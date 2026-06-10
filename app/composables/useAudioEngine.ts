// app/composables/useAudioEngine.ts — thin Web-Audio engine adapter. The scheduling
// LOGIC is the pure planner (audioSchedulePlanner.ts); this owns the imperative node
// graph + transport + the lookahead loop. Collaborators (ctx, resolveBuffer, timer)
// are injected so it's unit-testable with a mock context (no real audio). The real
// AudioContext (via standardized-audio-context) is created + injected by SP2b.
// ctx.currentTime is the MASTER clock; SP2b's rAF playhead reads currentTime() (slaves to it).
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import {
  planTimeline, windowEvents, dbToGain,
  type TimelinePlan, type ScheduledClip
} from '~~/app/utils/audio/audioSchedulePlanner'

const LOOKAHEAD_SEC = 0.1 // schedule this far ahead of the clock each tick
const TICK_MS = 25        // lookahead loop cadence

export interface AudioEngineDeps {
  ctx: any                                   // BaseAudioContext (real) or a mock
  resolveBuffer(clip: ScheduledClip): Promise<any> // AudioBuffer; fetch+decode (SP2b) or a stub
  setTimer(cb: () => void, ms: number): () => void  // setTimeout wrapper → cancel fn
  now?: () => number                         // reserved; loop uses ctx.currentTime
}

/** Outcome of a load: which clips could NOT be resolved (deleted R2 object, 404,
 * decode failure). A non-empty list is non-fatal — the rest of the timeline loads. */
export interface LoadResult {
  missingClipIds: string[]
}

export interface AudioEngine {
  load(state: TimelineState): Promise<LoadResult>
  play(): void
  pause(): void
  seek(sec: number): void
  currentTime(): number
  duration(): number
  isPlaying(): boolean
  dispose(): void
  clipSourceDuration(clipId: string): number
}

export function createAudioEngine(deps: AudioEngineDeps): AudioEngine {
  const { ctx, resolveBuffer, setTimer } = deps
  const now = deps.now ?? (() => ctx.currentTime)

  let plan: TimelinePlan = { tracks: [], clips: [], ramps: [] }
  const buffers = new Map<string, any>()
  const sourceDur = new Map<string, number>()
  const trackBus = new Map<string, any>()
  const busNominalDb = new Map<string, number>()   // each bus's nominal gain in dB
  const busCurrentGain = new Map<string, number>() // last scheduled LINEAR gain on each bus
  let durationSec = 0
  let useWallClockTransport = false

  let playing = false
  let ctxStart = 0           // transport clock time corresponding to timeline 0
  let pausedAt = 0           // timeline position while paused
  let scheduledUpTo = 0      // timeline time we've scheduled clips/ramps through
  let cancelTimer: (() => void) | null = null
  let active: any[] = []     // live buffer sources

  async function load(state: TimelineState): Promise<LoadResult> {
    plan = planTimeline(state)
    buffers.clear(); sourceDur.clear(); trackBus.clear(); busNominalDb.clear(); busCurrentGain.clear()
    for (const t of plan.tracks) {
      const bus = ctx.createGain()
      bus.gain.value = dbToGain(t.gainDb)
      bus.connect(ctx.destination)
      trackBus.set(t.trackId, bus)
      busNominalDb.set(t.trackId, t.gainDb)
      busCurrentGain.set(t.trackId, dbToGain(t.gainDb))
    }
    durationSec = 0
    const missingClipIds: string[] = []
    for (const clip of plan.clips) {
      let buf: any
      try {
        buf = await resolveBuffer(clip)
      } catch {
        // The clip's source couldn't be fetched/decoded (deleted R2 object, 404,
        // decode failure). Skip it rather than aborting the whole load: the project
        // must stay openable so the user can remove or replace the dead clip. The
        // clip still RENDERS on the timeline (planTimeline is buffer-independent) —
        // it just produces no audio and contributes nothing to duration. scheduleClip
        // already no-ops when a clip has no buffer, so playback tolerates it too.
        missingClipIds.push(clip.clipId)
        continue
      }
      buffers.set(clip.clipId, buf)
      sourceDur.set(clip.clipId, buf.duration)
      const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
      durationSec = Math.max(durationSec, clip.timelineStartSec + dur)
    }
    // V1.3: floor the transport duration at the full timeline length so a video-only AV
    // project (no audio clips → audio durationSec 0) still advances the clock. computeDuration
    // (baked into state.duration_sec on every edit) spans audio + video + overlay clips.
    // For pure audio this never shortens — decoded-buffer durations above already win.
    durationSec = Math.max(durationSec, (state as { duration_sec?: number }).duration_sec ?? 0)
    useWallClockTransport = buffers.size === 0 && durationSec > 0
    return { missingClipIds }
  }

  function transportNow(): number {
    return useWallClockTransport ? now() : ctx.currentTime
  }

  function transportPosition(): number {
    return Math.max(0, transportNow() - ctxStart)
  }

  function scheduleClip(clip: ScheduledClip): void {
    const buf = buffers.get(clip.clipId)
    if (!buf) return
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    const when = ctxStart + clip.timelineStartSec
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
    active.push(src)
  }

  function scheduleRamp(targetTrackId: string, atSec: number, toGainDb: number, rampSec: number): void {
    const bus = trackBus.get(targetTrackId)
    if (!bus) return
    // toGainDb is a DELTA from the bus's nominal gain (amount_db to duck, 0 to restore).
    const nominalDb = busNominalDb.get(targetTrackId) ?? 0
    const target = dbToGain(nominalDb + toGainDb)
    const held = busCurrentGain.get(targetTrackId) ?? dbToGain(nominalDb)
    const startAt = ctxStart + atSec
    // Anchor the ramp start at the held value so the gain stays flat until startAt
    // (Web Audio ramps from the previous automation event, else from t≈0), then ramp.
    bus.gain.setValueAtTime(held, startAt)
    bus.gain.linearRampToValueAtTime(target, startAt + rampSec)
    busCurrentGain.set(targetTrackId, target)
  }

  function tick(): void {
    if (!playing) return
    const pos = transportPosition()
    const horizon = pos + LOOKAHEAD_SEC
    const due = windowEvents(plan, scheduledUpTo, horizon)
    for (const clip of due.clips) scheduleClip(clip)
    for (const r of due.ramps) scheduleRamp(r.targetTrackId, r.atSec, r.toGainDb, r.rampSec)
    scheduledUpTo = horizon
    if (pos >= durationSec) { pause(); return }
    cancelTimer = setTimer(tick, TICK_MS)
  }

  function play(): void {
    if (playing) return
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume()
    playing = true
    ctxStart = transportNow() - pausedAt
    scheduledUpTo = pausedAt
    tick()
  }

  function stopActive(): void {
    for (const s of active) { try { s.stop() } catch { /* already stopped */ } }
    active = []
  }

  function pause(): void {
    if (!playing) return
    pausedAt = Math.min(durationSec, transportPosition())
    playing = false
    if (cancelTimer) { cancelTimer(); cancelTimer = null }
    stopActive()
  }

  function seek(sec: number): void {
    pausedAt = sec
    if (playing) {
      stopActive()
      ctxStart = transportNow() - sec
      scheduledUpTo = sec
    }
  }

  function currentTime(): number {
    return playing ? Math.min(durationSec, transportPosition()) : pausedAt
  }

  function dispose(): void {
    pause()
    for (const bus of trackBus.values()) { try { bus.disconnect() } catch { /* noop */ } }
    trackBus.clear(); buffers.clear()
  }

  return { load, play, pause, seek, currentTime, duration: () => durationSec, isPlaying: () => playing, dispose, clipSourceDuration: (clipId: string) => sourceDur.get(clipId) ?? 0 }
}
