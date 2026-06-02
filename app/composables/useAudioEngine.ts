// app/composables/useAudioEngine.ts — thin Web-Audio engine adapter. The scheduling
// LOGIC is the pure planner (audioSchedulePlanner.ts); this owns the imperative node
// graph + transport + the lookahead loop. Collaborators (ctx, resolveBuffer, timer)
// are injected so it's unit-testable with a mock context (no real audio). The real
// AudioContext (via standardized-audio-context) is created + injected by SP2b.
// ctx.currentTime is the MASTER clock; SP2b slaves the GSAP playhead to currentTime().
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

export interface AudioEngine {
  load(state: TimelineState): Promise<void>
  play(): void
  pause(): void
  seek(sec: number): void
  currentTime(): number
  duration(): number
  isPlaying(): boolean
  dispose(): void
}

export function createAudioEngine(deps: AudioEngineDeps): AudioEngine {
  const { ctx, resolveBuffer, setTimer } = deps

  let plan: TimelinePlan = { tracks: [], clips: [], ramps: [] }
  const buffers = new Map<string, any>()
  const trackBus = new Map<string, any>()
  const busNominalDb = new Map<string, number>()   // each bus's nominal gain in dB
  const busCurrentGain = new Map<string, number>() // last scheduled LINEAR gain on each bus
  let durationSec = 0

  let playing = false
  let ctxStart = 0           // ctx.currentTime corresponding to timeline 0
  let pausedAt = 0           // timeline position while paused
  let scheduledUpTo = 0      // timeline time we've scheduled clips/ramps through
  let cancelTimer: (() => void) | null = null
  let active: any[] = []     // live buffer sources

  async function load(state: TimelineState): Promise<void> {
    plan = planTimeline(state)
    buffers.clear(); trackBus.clear(); busNominalDb.clear(); busCurrentGain.clear()
    for (const t of plan.tracks) {
      const bus = ctx.createGain()
      bus.gain.value = dbToGain(t.gainDb)
      bus.connect(ctx.destination)
      trackBus.set(t.trackId, bus)
      busNominalDb.set(t.trackId, t.gainDb)
      busCurrentGain.set(t.trackId, dbToGain(t.gainDb))
    }
    durationSec = 0
    for (const clip of plan.clips) {
      const buf = await resolveBuffer(clip)
      buffers.set(clip.clipId, buf)
      const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
      durationSec = Math.max(durationSec, clip.timelineStartSec + dur)
    }
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
    const pos = ctx.currentTime - ctxStart
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
    ctxStart = ctx.currentTime - pausedAt
    scheduledUpTo = pausedAt
    tick()
  }

  function stopActive(): void {
    for (const s of active) { try { s.stop() } catch { /* already stopped */ } }
    active = []
  }

  function pause(): void {
    if (!playing) return
    pausedAt = ctx.currentTime - ctxStart
    playing = false
    if (cancelTimer) { cancelTimer(); cancelTimer = null }
    stopActive()
  }

  function seek(sec: number): void {
    pausedAt = sec
    if (playing) {
      stopActive()
      ctxStart = ctx.currentTime - sec
      scheduledUpTo = sec
    }
  }

  function currentTime(): number {
    return playing ? ctx.currentTime - ctxStart : pausedAt
  }

  function dispose(): void {
    pause()
    for (const bus of trackBus.values()) { try { bus.disconnect() } catch { /* noop */ } }
    trackBus.clear(); buffers.clear()
  }

  return { load, play, pause, seek, currentTime, duration: () => durationSec, isPlaying: () => playing, dispose }
}
