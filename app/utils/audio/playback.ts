function finitePositive(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null && value > 0 ? value : 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatAudioTime(seconds: number | null | undefined): string {
  const whole = Math.floor(finitePositive(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`
  }

  return `${pad2(minutes)}:${pad2(secs)}`
}

export function resolveAudioDuration(nativeDuration: number | null | undefined, fallbackDuration: number | null | undefined): number {
  const native = finitePositive(nativeDuration)
  if (native > 0) return native
  return finitePositive(fallbackDuration)
}

function mediaRangeEnd(ranges: Pick<TimeRanges, 'length' | 'end'> | null | undefined): number {
  if (!ranges?.length) return 0
  try {
    return finitePositive(ranges.end(ranges.length - 1))
  } catch {
    return 0
  }
}

export function mediaElementDuration(
  media: Pick<HTMLMediaElement, 'duration' | 'seekable' | 'buffered'> | null | undefined,
  fallbackDuration: number | null | undefined
): number {
  if (!media) return resolveAudioDuration(null, fallbackDuration)
  const native = resolveAudioDuration(media.duration, null)
  if (native > 0) return native

  const ranged = mediaRangeEnd(media.seekable) || mediaRangeEnd(media.buffered)
  return resolveAudioDuration(ranged, fallbackDuration)
}

export function audioProgressPercent(currentTime: number | null | undefined, duration: number | null | undefined): number {
  const dur = finitePositive(duration)
  if (dur <= 0) return 0
  const current = Math.min(Math.max(finitePositive(currentTime), 0), dur)
  return (current / dur) * 100
}

export function audioTimeFromProgress(percent: number | null | undefined, duration: number | null | undefined): number {
  const dur = finitePositive(duration)
  if (dur <= 0) return 0
  const pct = Math.min(Math.max(Number.isFinite(percent) && percent != null ? percent : 0, 0), 100)
  return (pct / 100) * dur
}
