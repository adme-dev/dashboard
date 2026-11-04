/** Report the actual animation clock from a sandboxed preview without replacing its callbacks. */
export function withBannerPreviewPlayback(html: string, frameId: number): string {
  return html.replace('</body>', `<script>
(function() {
  function report() {
    var tl = window.__engagrTimeline;
    var state = 'unavailable', duration = 0, current = 0, iteration = 1, repeat = 0;
    if (tl) {
      duration = tl.duration();
      current = Math.min(duration, Math.max(0, tl.time()));
      iteration = tl.iteration();
      repeat = tl.repeat();
      state = duration <= 0 ? 'static' : repeat !== -1 && tl.totalProgress() >= 1 ? 'ended' : tl.paused() ? 'paused' : 'playing';
    }
    window.parent.postMessage({ type: 'banner-preview-playback', frameId: ${JSON.stringify(frameId)}, state: state, duration: duration, current: current, iteration: iteration, repeat: repeat }, '*');
  }
  report();
  var timer = setInterval(report, 100);
  window.addEventListener('pagehide', function() { clearInterval(timer); });
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
}

export function readBannerPreviewPlayback(value: unknown, frameId: number): BannerPreviewPlayback | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.type !== 'banner-preview-playback' || data.frameId !== frameId
    || !['playing', 'paused', 'ended', 'static', 'unavailable'].includes(String(data.state))
    || ![data.current, data.duration, data.iteration, data.repeat].every(n => typeof n === 'number' && Number.isFinite(n))
    || Number(data.duration) < 0 || Number(data.current) < 0 || Number(data.current) > Number(data.duration)
    || !Number.isInteger(data.iteration) || Number(data.iteration) < 1
    || !Number.isInteger(data.repeat) || Number(data.repeat) < -1) return null
  return { state: data.state, current: data.current, duration: data.duration, iteration: data.iteration, repeat: data.repeat } as BannerPreviewPlayback
}
