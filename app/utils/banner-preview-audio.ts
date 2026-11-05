/** Audio controls for sandboxed saved previews. Exported artwork is unchanged. */
export function withBannerPreviewAudio(html: string): string {
  return html.replace('</body>', `<script>
(function() {
  var tracks = Array.from(document.querySelectorAll('audio')).filter(function(audio) { return audio.volume > 0; });
  if (!tracks.length) return;
  var failed = new WeakSet();
  window.__engagrPreviewMuted = true;
  window.__engagrResetPreviewAudio = function() { tracks.forEach(function(audio) { failed.delete(audio); }); };
  function report(status) {
    window.parent.postMessage({ type: 'banner-preview-audio', status: status }, '*');
  }
  tracks.forEach(function(audio) {
    // The host sends the current sound choice as soon as this frame is ready.
    audio.muted = true;
    var play = audio.play.bind(audio);
    audio.play = function() {
      if (failed.has(audio)) return Promise.resolve();
      return play().catch(function(error) {
        if (error && error.name === 'AbortError') return;
        failed.add(audio);
        report(error && error.name === 'NotAllowedError' ? 'blocked' : 'error');
        if (error && error.name === 'NotAllowedError' && window.dispatchEvent) window.dispatchEvent(new Event('banner-preview-audio-blocked'));
      });
    };
    audio.addEventListener('error', function() { failed.add(audio); report('error'); });
  });
  window.addEventListener('message', function(event) {
    if (event.source !== window.parent || !event.data || event.data.type !== 'banner-preview-sound' || typeof event.data.muted !== 'boolean') return;
    window.__engagrPreviewMuted = event.data.muted;
    tracks.forEach(function(audio) { failed.delete(audio); audio.muted = window.__engagrPreparingMedia ? true : event.data.muted; });
  });
  report('ready');
})();
</script>
</body>`)
}
