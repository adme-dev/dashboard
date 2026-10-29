import type gsap from 'gsap'

type Track = {
  audio: HTMLAudioElement
  start: number
  end: number
  loop: boolean
  wanted: boolean
  pending: boolean
  failed: boolean
  disposed: boolean
}
const owners = new WeakMap<HTMLAudioElement, Track>()
const tracks = new WeakMap<gsap.core.Timeline, Track[]>()

/** Native media keeps playing when GSAP pauses or dies, so it needs explicit ownership. */
export function registerTimelineAudio(timeline: gsap.core.Timeline, audio: HTMLAudioElement, options: {
  start: number; end: number; volume: number; loop: boolean
}) {
  let list = tracks.get(timeline)
  if (!list) {
    list = []
    tracks.set(timeline, list)
    const previous = timeline.eventCallback('onUpdate')
    timeline.eventCallback('onUpdate', () => {
      previous?.call(timeline)
      syncTimelineAudio(timeline)
    })
  }
  const previousOwner = owners.get(audio)
  if (previousOwner) {
    previousOwner.wanted = false
    previousOwner.disposed = true
  }
  audio.pause()
  audio.volume = Math.min(1, Math.max(0, options.volume))
  audio.loop = options.loop
  const track = { audio, ...options, wanted: false, pending: false, failed: false, disposed: false }
  owners.set(audio, track)
  list.push(track)
}

export function syncTimelineAudio(timeline: gsap.core.Timeline, forceSeek = false) {
  const time = timeline.time()
  for (const track of tracks.get(timeline) || []) {
    if (track.disposed) continue
    const { audio, start, end, loop } = track
    const elapsed = Math.max(0, time - start)
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity
    const active = time >= start && time < end && (loop || elapsed < duration)
    const target = loop && duration !== Infinity ? elapsed % duration : Math.min(elapsed, duration)
    track.wanted = active && !timeline.paused() && timeline.timeScale() > 0
    if (!track.wanted) {
      audio.pause()
      track.failed = false
    }
    if (forceSeek || !track.wanted || Math.abs(audio.currentTime - target) > 0.3) {
      // Metadata may still be loading; the next update will retry positioning.
      try { audio.currentTime = target } catch { /* not seekable yet */ }
    }
    audio.playbackRate = Math.max(0.0625, Math.min(16, Math.abs(timeline.timeScale()) || 1))
    if (track.wanted && audio.paused && !track.pending && !track.failed) {
      track.pending = true
      void audio.play().then(() => {
        // A pending browser play request must never outlive Pause or disposal.
        if ((!track.wanted || track.disposed) && owners.get(audio) === track) audio.pause()
      }).catch((error: unknown) => { track.failed = !(error instanceof DOMException && error.name === 'AbortError') }).finally(() => {
        track.pending = false
        if (track.wanted && !track.disposed) syncTimelineAudio(timeline)
      })
    }
  }
}

export function pauseTimelineAudio(timeline: gsap.core.Timeline) {
  for (const track of tracks.get(timeline) || []) {
    track.wanted = false
    track.failed = false
    if (owners.get(track.audio) === track) track.audio.pause()
  }
}

export function disposeTimelineAudio(timeline: gsap.core.Timeline) {
  pauseTimelineAudio(timeline)
  for (const track of tracks.get(timeline) || []) track.disposed = true
  tracks.delete(timeline)
}
