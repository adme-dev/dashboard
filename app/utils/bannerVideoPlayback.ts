import type { Layer } from '~/types/banner-studio'

export type BannerVideoPlaybackClock = Pick<Layer, 'startTime' | 'endTime' | 'mediaStart' | 'mediaEnd' | 'mediaLoop' | 'hidden'>

/** Shared interactive transport for artboards and linked Video Studio artwork. */
export function createBannerVideoTransport() {
  const ownerKey = Symbol.for('xeroflow.banner-video.transport')
  type OwnedVideo = HTMLVideoElement & { [key: symbol]: unknown }
  const tracks = new Map<HTMLVideoElement, { clock: BannerVideoPlaybackClock, time: number, playing: boolean, wanted: boolean, positionPending: boolean, pending: boolean, failed: boolean, correctedAt: number, disposed: boolean, release: () => void }>()
  function sync(video: HTMLVideoElement, time: number, playing: boolean, clock: BannerVideoPlaybackClock) {
    let track = tracks.get(video)
    if (!track) {
      track = { clock, time, playing, wanted: false, positionPending: false, pending: false, failed: false, correctedAt: -Infinity, disposed: false, release: () => {} }
      tracks.set(video, track)
      ;(video as OwnedVideo)[ownerKey] = track
      video.muted = true
      video.loop = false
      const repaint = () => {
        if (!track!.disposed) sync(video, track!.time, track!.playing, track!.clock)
      }
      video.addEventListener('seeked', repaint)
      video.addEventListener('loadeddata', repaint)
      track.release = () => {
        video.removeEventListener('seeked', repaint)
        video.removeEventListener('loadeddata', repaint)
      }
    }
    if ((video as OwnedVideo)[ownerKey] !== track) return
    const previousTime = track.time
    const wasWanted = track.wanted
    track.clock = clock
    track.time = time
    track.playing = playing
    const start = Math.max(0, clock.mediaStart ?? 0)
    const end = clock.mediaEnd ?? video.duration
    const length = end - start
    const elapsed = Math.max(0, time - (clock.startTime || 0))
    const target = start + (length > 0 ? clock.mediaLoop ? elapsed % length : Math.min(elapsed, length) : elapsed)
    const active = !clock.hidden && time >= (clock.startTime || 0) && time < clock.endTime
      && (clock.mediaLoop || !(length > 0) || elapsed < length)
    const wanted = active && playing
    const previousElapsed = Math.max(0, previousTime - (clock.startTime || 0))
    const boundary = time < previousTime || (clock.mediaLoop && length > 0 && Math.floor(elapsed / length) !== Math.floor(previousElapsed / length))
    const positionNow = !wanted || !wasWanted || boundary || track.positionPending
    track.positionPending = Boolean(positionNow)
    track.wanted = wanted
    if (!wanted) {
      video.pause()
      track.failed = false
    }
    // Seeks are asynchronous. Let native decoding run between bounded drift
    // corrections; never replace an in-flight seek on every animation frame.
    const drift = Math.abs(video.currentTime - target)
    if (!video.seeking) {
      try {
        if (drift > (positionNow ? 0.015 : 0.3) && (positionNow || Date.now() - track.correctedAt > 300)) {
          video.currentTime = target
          track.correctedAt = Date.now()
        }
        track.positionPending = false
      } catch { /* metadata will retry */ }
    }
    if (wanted && video.paused && !track.pending && !track.failed) {
      track.pending = true
      void video.play().then(() => {
        if ((!track!.wanted || track!.disposed) && (!(video as OwnedVideo)[ownerKey] || (video as OwnedVideo)[ownerKey] === track)) video.pause()
      }).catch((error: unknown) => {
        track!.failed = !(error instanceof DOMException && error.name === 'AbortError')
      }).finally(() => { track!.pending = false })
    }
  }
  function pause() {
    for (const [video, track] of tracks) {
      track.playing = false
      track.wanted = false
      track.failed = false
      if ((video as OwnedVideo)[ownerKey] === track) video.pause()
    }
  }
  function dispose() {
    pause()
    for (const [video, track] of tracks) {
      track.disposed = true
      track.release()
      if ((video as OwnedVideo)[ownerKey] === track) (video as OwnedVideo)[ownerKey] = undefined
    }
    tracks.clear()
  }
  return { sync, pause, dispose }
}
