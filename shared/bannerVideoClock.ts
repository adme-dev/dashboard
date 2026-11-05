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

/** Native decoding during playback; exact frame seeks only while the timeline is paused. */
export function bannerVideoSyncScript(layer: BannerVideoClock & { id: number, startTime?: number, endTime?: number }): string {
  const start = layer.startTime || 0
  const duration = Math.max(0, (layer.endTime || start + 3) - start)
  return `  (function() {
    var vid = document.querySelector('[data-id="${layer.id}"] video');
    if (!vid) return;
    vid.pause();
    var p = { t: 0 }, pending = false, blocked = false, previous = 0;
    function sync() {
      var mt = ${bannerVideoMediaTimeScript(layer)}(p.t);
      var end = ${Number.isFinite(layer.mediaEnd) ? layer.mediaEnd : 'vid.duration'};
      var ended = ${Boolean(!layer.mediaLoop)} && isFinite(end) && mt >= end;
      var wrapped = mt < previous - 0.001;
      previous = mt;
      if (tl.paused() || ended) {
        vid.pause();
        blocked = false;
        if (Math.abs(vid.currentTime - mt) > 0.001) vid.currentTime = mt;
        return;
      }
      // Repeated currentTime writes abort Safari's decoder before it can present a frame.
      // Correct only genuine clock drift, a loop boundary, or a resumed scrub position.
      if (!vid.seeking && (wrapped || Math.abs(vid.currentTime - mt) > 0.5)) vid.currentTime = mt;
      var rate = Math.max(0.0625, Math.min(16, Math.abs(tl.timeScale())));
      if (Math.abs(vid.playbackRate - rate) > 0.001) vid.playbackRate = rate;
      if (vid.paused && !pending && !blocked) {
        pending = true;
        var playing = vid.play();
        if (playing) playing.catch(function(error) { blocked = error && error.name === 'NotAllowedError'; }).finally(function() { pending = false; });
        else pending = false;
      }
    }
    tl.to(p, { t: ${duration.toFixed(2)}, duration: ${duration.toFixed(2)}, ease: 'none', onUpdate: sync, onComplete: function() { vid.pause(); } }, ${start});
  })();`
}
