// One media clock for video layers, shared by editor playback, scrubbing and
// both HTML exporters so they cannot drift apart.
//
// `elapsed` is seconds since the layer appeared. The clip plays at normal speed
// from `mediaStart`. A looping clip restarts at `mediaEnd`; a non-looping clip
// holds its final frame. Artwork presence (startTime/endTime) stays separate.

export interface BannerVideoClock {
  mediaStart?: number
  mediaEnd?: number
  mediaLoop?: boolean
}

export function bannerVideoMediaTime(elapsed: number, clock: BannerVideoClock, mediaDuration = Number.NaN): number {
  const start = Math.max(0, clock.mediaStart ?? 0)
  const end = clock.mediaEnd ?? mediaDuration
  const length = Number.isFinite(end) ? end - start : Number.NaN
  const t = Math.max(0, elapsed)
  if (!(length > 0)) return start + t
  if (clock.mediaLoop) return start + (t % length)
  return start + Math.min(t, length)
}

/** The same clock as an inline expression for exported HTML (`t` and `vid` are in scope). */
export function bannerVideoMediaTimeScript(clock: BannerVideoClock): string {
  const n = (value: number | undefined) => (Number.isFinite(value) ? Number(value) : 'NaN')
  return `(function(t){var s=${Math.max(0, Number(clock.mediaStart) || 0)},e=${n(clock.mediaEnd)};if(!(e===e))e=vid.duration;var l=e-s;t=Math.max(0,t);`
    + `if(!(l>0))return s+t;return ${clock.mediaLoop ? 's+(t%l)' : 's+Math.min(t,l)'};})`
}
