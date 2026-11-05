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
    var p = { t: 0 }, previous = 0, pending = false;
    function sync() {
      var loaded = isFinite(a.duration) && a.duration > 0;
      var mt = loaded ? (a.loop ? p.t % a.duration : Math.min(p.t, a.duration)) : p.t;
      var wrapped = p.t < previous - 0.001;
      previous = p.t;
      if (tl.paused()) {
        a.pause();
        if (Math.abs(a.currentTime - mt) > 0.001) a.currentTime = mt;
        return;
      }
      if (loaded && !a.loop && p.t >= a.duration) { a.pause(); return; }
      // Seeking a playing MP3 repeatedly interrupts Safari's decoder. A buffered
      // or pending play request must be allowed to start without chasing GSAP.
      if (wrapped && Math.abs(a.currentTime - mt) > 0.001) a.currentTime = mt;
      var rate = Math.max(0.0625, Math.min(16, Math.abs(tl.timeScale())));
      if (Math.abs(a.playbackRate - rate) > 0.001) a.playbackRate = rate;
      if (a.paused && !pending) {
        pending = true;
        var playing = a.play();
        if (playing) playing.catch(function() {}).finally(function() { pending = false; if (tl.paused()) a.pause(); });
        else pending = false;
      }
    }
    tl.to(p, { t: ${duration.toFixed(2)}, duration: ${duration.toFixed(2)}, ease: 'none', onUpdate: sync, onComplete: function() { a.pause(); } }, ${start});
  })();`
}
