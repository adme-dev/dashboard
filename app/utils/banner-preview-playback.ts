/** The first tap primes native media before starting the artwork clock. */
export function withBannerPreviewPlayback(html: string, frameId: number): string {
  return html.replace('</body>', `<script>
(function() {
  var commandId = 0, generation = 0, starting = false, needsGesture = false;
  var media = Array.from(document.querySelectorAll('audio,video')).filter(function(el) {
    return el.getAttribute('src') && !(el.tagName === 'AUDIO' && el.volume === 0);
  });
  function pauseMedia() { media.forEach(function(el) { el.pause(); }); }
  function restoreSound() {
    window.__engagrPreparingMedia = false;
    media.forEach(function(el) { if (el.tagName === 'AUDIO') el.muted = window.__engagrPreviewMuted !== false; });
  }
  function seek(tl, time) {
    tl.pause(); pauseMedia();
    // Force same-time seeks too: priming may advance native media while GSAP is stopped.
    tl.totalTime(time, false);
    if (tl.render) tl.render(time, false, true);
    if (window.__engagrUpdateMasks) window.__engagrUpdateMasks();
    pauseMedia();
  }
  function report() {
    var tl = window.__engagrTimeline;
    var state = 'unavailable', duration = 0, current = 0, iteration = 1, repeat = 0;
    if (tl) {
      duration = tl.duration(); current = Math.min(duration, Math.max(0, tl.time()));
      iteration = tl.iteration(); repeat = tl.repeat();
      state = starting ? 'loading' : duration <= 0 ? 'static' : repeat !== -1 && tl.totalProgress() >= 1 ? 'ended' : tl.paused() ? 'paused' : 'playing';
      if (media.some(function(el) { return !!el.error; })) state = 'unavailable';
    }
    window.parent.postMessage({ type: 'banner-preview-playback', frameId: ${JSON.stringify(frameId)}, commandId: commandId, state: state, duration: duration, current: current, iteration: iteration, repeat: repeat, starting: starting, needsGesture: needsGesture, mediaReady: media.every(function(el) { return el.readyState >= 2; }) }, '*');
  }
  function stop() {
    generation++; starting = false;
    var tl = window.__engagrTimeline;
    if (tl) tl.pause();
    pauseMedia(); restoreSound(); report();
  }
  function settled(el) {
    if (!el.seeking && el.readyState >= 2) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { finish(); reject(new Error('Media seek timed out')); }, 15000);
      function finish() { clearTimeout(timer); el.removeEventListener('seeked', check); el.removeEventListener('loadeddata', check); el.removeEventListener('error', check); }
      function check() {
        if (el.error) { finish(); reject(new Error('Media unavailable')); }
        else if (!el.seeking && el.readyState >= 2) { finish(); resolve(); }
      }
      el.addEventListener('seeked', check); el.addEventListener('loadeddata', check); el.addEventListener('error', check); check();
    });
  }
  function start(replay) {
    var tl = window.__engagrTimeline;
    if (!tl || starting) return;
    if (!media.length) { if (replay || tl.time() >= tl.duration()) seek(tl, 0); tl.play(); report(); return; }
    var run = ++generation, time = replay || tl.time() >= tl.duration() ? 0 : tl.time();
    starting = true; needsGesture = false; tl.pause();
    window.__engagrPreparingMedia = true;
    if (window.__engagrResetPreviewAudio) window.__engagrResetPreviewAudio();
    media.forEach(function(el) { if (el.tagName === 'AUDIO') el.muted = true; });
    // Run play() synchronously from a tap inside this frame. iOS may not preload
    // until this call, and a parent postMessage does not reliably carry a gesture.
    var pending = media.map(function(el) { try { return Promise.resolve(el.play()); } catch (err) { return Promise.reject(err); } });
    report();
    var timer = setTimeout(function() { if (run === generation) { stop(); needsGesture = true; report(); } }, 15000);
    Promise.all(pending).then(function() {
      if (run !== generation) { clearTimeout(timer); if (!starting && tl.paused()) pauseMedia(); return; }
      if (media.some(function(el) { return el.paused && !el.ended; })) throw new Error('Tap required');
      pauseMedia(); seek(tl, time);
      return Promise.all(media.map(settled));
    }).then(function() {
      if (run !== generation) { clearTimeout(timer); if (!starting && tl.paused()) pauseMedia(); return; }
      clearTimeout(timer); starting = false; restoreSound(); tl.play(); report();
    }).catch(function() {
      clearTimeout(timer);
      if (run !== generation) { clearTimeout(timer); if (!starting && tl.paused()) pauseMedia(); return; }
      stop(); needsGesture = true; report();
    });
  }
  window.addEventListener('banner-preview-audio-blocked', function() { stop(); needsGesture = true; report(); });
  function onTap() { var tl = window.__engagrTimeline; if (tl && !starting && tl.paused()) start(false); }
  document.addEventListener('click', onTap);
  function onKey(event) { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); start(false); } }
  document.addEventListener('keydown', onKey);
  document.body.tabIndex = 0;
  window.addEventListener('message', function(event) {
    var data = event.data, tl = window.__engagrTimeline;
    if (event.source !== window.parent || !data || data.type !== 'banner-preview-control'
      || data.frameId !== ${JSON.stringify(frameId)} || !Number.isSafeInteger(data.commandId)
      || data.commandId <= commandId || !tl) return;
    if (['seek', 'play', 'pause', 'replay'].indexOf(data.action) < 0) return;
    if (data.action === 'seek' && (typeof data.time !== 'number' || !isFinite(data.time) || data.time < 0 || data.time > tl.duration())) return;
    commandId = data.commandId;
    if (data.action === 'pause') stop();
    if (data.action === 'seek') { stop(); seek(tl, data.time); }
    if (data.action === 'play' || data.action === 'replay') start(data.action === 'replay');
    report();
  });
  media.forEach(function(el) { el.addEventListener('canplay', report); el.addEventListener('error', report); });
  report();
  var timer = setInterval(report, 100);
  window.addEventListener('pagehide', function() { stop(); clearInterval(timer); document.removeEventListener('click', onTap); document.removeEventListener('keydown', onKey); });
})();
</script>
</body>`)
}

export interface BannerPreviewPlayback {
  state: 'loading' | 'playing' | 'paused' | 'ended' | 'static' | 'unavailable'
  current: number
  duration: number
  iteration: number
  repeat: number
  starting?: boolean
  needsGesture?: boolean
  mediaReady?: boolean
}

export function readBannerPreviewPlayback(value: unknown, frameId: number): BannerPreviewPlayback | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.type !== 'banner-preview-playback' || data.frameId !== frameId
    || !['loading', 'playing', 'paused', 'ended', 'static', 'unavailable'].includes(String(data.state))
    || ![data.current, data.duration, data.iteration, data.repeat].every(n => typeof n === 'number' && Number.isFinite(n))
    || Number(data.duration) < 0 || Number(data.current) < 0 || Number(data.current) > Number(data.duration)
    || !Number.isInteger(data.iteration) || Number(data.iteration) < 1
    || !Number.isInteger(data.repeat) || Number(data.repeat) < -1) return null
  return { state: data.state, current: data.current, duration: data.duration, iteration: data.iteration, repeat: data.repeat, starting: data.starting === true, needsGesture: data.needsGesture === true, mediaReady: data.mediaReady !== false } as BannerPreviewPlayback
}
