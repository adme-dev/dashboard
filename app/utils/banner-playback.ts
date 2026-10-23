import type { BannerPlayback } from '~/types/banner-studio'

export function resolveBannerPlayback(value?: BannerPlayback): BannerPlayback | undefined {
  if (!value || !Number.isFinite(value.duration) || value.duration <= 0 || value.duration > 300
    || !Number.isInteger(value.loopCount) || value.loopCount < 0 || value.loopCount > 1000) return undefined
  return { duration: value.duration, loopCount: value.loopCount }
}

export function bannerPlaybackRepeat(playback: BannerPlayback): number {
  return playback.loopCount === 0 ? -1 : playback.loopCount - 1
}

/** A no-op clock holds the final artwork to the source cycle end. */
export function applyBannerPlayback(timeline: { to: (target: object, vars: object, at: number) => unknown, repeat: (count: number) => unknown }, value?: BannerPlayback): void {
  const playback = resolveBannerPlayback(value)
  if (!playback) return
  timeline.to({}, { duration: playback.duration }, 0)
  timeline.repeat(bannerPlaybackRepeat(playback))
}
