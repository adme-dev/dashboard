export interface BannerAudioClock {
  mediaStart?: number
  mediaEnd?: number
  loopAudio?: boolean
  volume?: number
  muted?: boolean
  hidden?: boolean
  audioFadeIn?: number
  audioFadeOut?: number
}

/** Self-contained so the exact same clock can be embedded in exported artwork. */
export function bannerAudioState(elapsed: number, span: number, clock: BannerAudioClock, duration = Infinity) {
  const sourceEnd = Number.isFinite(duration) && duration > 0 ? duration : Infinity
  const start = Math.min(Math.max(0, Number(clock.mediaStart) || 0), Math.max(0, sourceEnd - 0.001))
  const end = Math.min(sourceEnd, Number.isFinite(clock.mediaEnd) && clock.mediaEnd! > start ? clock.mediaEnd! : sourceEnd)
  const length = end - start
  const t = Math.max(0, elapsed)
  const audibleSpan = clock.loopAudio ? span : Math.min(span, length)
  const fadeIn = Math.max(0, Number(clock.audioFadeIn) || 0)
  const fadeOut = Math.max(0, Number(clock.audioFadeOut) || 0)
  const gain = Math.min(1, fadeIn ? t / fadeIn : 1) * Math.min(1, fadeOut ? Math.max(0, audibleSpan - t) / fadeOut : 1)
  return {
    time: start + (clock.loopAudio && Number.isFinite(length) && length > 0 ? t % length : Math.min(t, length)),
    active: elapsed >= 0 && t < audibleSpan,
    volume: clock.muted || clock.hidden ? 0 : Math.max(0, Math.min(1, clock.volume ?? 1)) * gain
  }
}
