interface BannerAudioClock {
  id: number
  startTime?: number
  endTime?: number
  volume?: number
  muted?: boolean
  hidden?: boolean
  loopAudio?: boolean
}

/** Keep native audio decoding continuous; reposition only for an explicit seek or loop. */
export function bannerAudioSyncScript(layer: BannerAudioClock): string {
  const start = layer.startTime || 0
  const duration = Math.max(0, (layer.endTime || start + 3) - start)
  const volume = layer.muted || layer.hidden ? 0 : Math.min(1, Math.max(0, layer.volume ?? 1))
  return `  (function() {
    var a = document.querySelector('[data-id="${layer.id}"]');
    if (!a) return;
    a.pause(); a.volume = ${volume}; a.loop = ${Boolean(layer.loopAudio)};
    var p = { t: 0 }, previous = 0, pending = false, seeking = false, target = null, wanted = false;
    function pump() {
      if (pending || seeking) return;
      if (target !== null) {
        // Setting currentTime before metadata exists may be ignored by Safari.
        if (!(a.readyState > 0 || (isFinite(a.duration) && a.duration > 0))) return;
        var next = target;
        target = null;
        if (Math.abs(a.currentTime - next) > 0.001) {
          seeking = true;
          a.pause();
          try { a.currentTime = next; } catch (_) { seeking = false; target = next; }
          return;
        }
      }
      if (wanted && a.paused) {
        pending = true;
        var playing;
        try { playing = a.play(); } catch (_) { pending = false; return; }
        if (playing) playing.catch(function() {}).finally(function() {
          pending = false;
          if (!wanted) a.pause();
          // A seek requested during play startup waits for that request to settle.
          if (target !== null) pump();
        });
        else pending = false;
      }
    }
    a.addEventListener('seeked', function() { seeking = false; pump(); });
    a.addEventListener('loadedmetadata', pump);
    a.addEventListener('error', function() { wanted = false; seeking = false; target = null; a.pause(); });
    function sync() {
      var loaded = isFinite(a.duration) && a.duration > 0;
      var mt = loaded ? (a.loop ? p.t % a.duration : Math.min(p.t, a.duration)) : p.t;
      var wrapped = p.t < previous - 0.001;
      previous = p.t;
      if (tl.paused()) {
        wanted = false;
        a.pause();
        target = mt;
        pump();
        return;
      }
      if (loaded && !a.loop && p.t >= a.duration) { wanted = false; target = null; a.pause(); return; }
      // Seeking a playing MP3 repeatedly interrupts Safari's decoder. A buffered
      // or pending play request must be allowed to start without chasing GSAP.
      wanted = true;
      if (wrapped) target = mt;
      var rate = Math.max(0.0625, Math.min(16, Math.abs(tl.timeScale())));
      if (Math.abs(a.playbackRate - rate) > 0.001) a.playbackRate = rate;
      pump();
    }
    tl.to(p, { t: ${duration.toFixed(2)}, duration: ${duration.toFixed(2)}, ease: 'none', onUpdate: sync, onComplete: function() { wanted = false; target = null; a.pause(); } }, ${start});
  })();`
}
