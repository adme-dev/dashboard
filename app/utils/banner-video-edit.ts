import type { BannerVideoClock } from '~~/shared/bannerVideoClock'
import { bannerVideoMediaTime } from '~~/shared/bannerVideoClock'

export function videoTrimRange(
  clock: BannerVideoClock,
  duration: number
): [number, number] {
  if (!Number.isFinite(duration) || duration <= 0) return [0, 0]
  const start = Math.max(
    0,
    Math.min(
      duration - Math.min(0.01, duration),
      Number.isFinite(clock.mediaStart) ? clock.mediaStart! : 0
    )
  )
  const end = Math.max(
    start + Math.min(0.01, duration),
    Math.min(
      duration,
      Number.isFinite(clock.mediaEnd) ? clock.mediaEnd! : duration
    )
  )
  return [start, end]
}

export function validVideoTrim(
  start: number,
  end: number,
  duration: number
): boolean {
  return (
    [start, end, duration].every(Number.isFinite)
    && start >= 0
    && end > start
    && end <= duration
  )
}

/** Sample the same media clock as playback, including a loop or a held final frame. */
export function videoFrameTimes(
  clock: BannerVideoClock,
  duration: number,
  span: number,
  count = 12
): number[] {
  if (
    !Number.isFinite(duration)
    || duration <= 0
    || !Number.isFinite(span)
    || span <= 0
  )
    return []
  const samples = Math.min(12, Math.max(1, Math.floor(count)))
  return Array.from({ length: samples }, (_, i) =>
    Math.min(
      Math.max(0, duration - 0.001),
      Math.max(
        0,
        bannerVideoMediaTime(((i + 0.5) * span) / samples, clock, duration)
      )
    )
  )
}
