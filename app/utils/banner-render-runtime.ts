import type { Layer } from '~/types/banner-studio'

export type RenderFps = { num: number, den: number }

export type RenderLintFinding = {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  elementId?: string
  fixHint?: string
}

export type EngagrFrameRuntime = {
  ready: boolean
  duration: number
  fps?: RenderFps
  seek: (timeSeconds: number) => void | Promise<void>
  getDiagnostics?: () => Record<string, unknown>
  getVisibleElements?: () => Array<{ id: string, type?: string, start?: number, end?: number }>
}

export function parseRenderFps(input: number | string | RenderFps): RenderFps {
  if (typeof input === 'object' && input) {
    return normalizeRenderFps(input)
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) throw new Error('FPS must be a positive finite number')
    if (!Number.isInteger(input)) throw new Error('Decimal FPS is ambiguous; use an exact rational such as 30000/1001')
    return { num: input, den: 1 }
  }
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return normalizeRenderFps({ num: Number(trimmed), den: 1 })
  const match = trimmed.match(/^(\d+)\/(\d+)$/)
  if (!match) throw new Error('FPS must be an integer or exact rational')
  return normalizeRenderFps({ num: Number(match[1]), den: Number(match[2]) })
}

export function normalizeRenderFps(fps: RenderFps): RenderFps {
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw new Error('FPS numerator and denominator must be positive integers')
  }
  const divisor = gcd(fps.num, fps.den)
  return { num: fps.num / divisor, den: fps.den / divisor }
}

export function fpsToNumber(fps: RenderFps): number {
  return fps.num / fps.den
}

export function formatFpsForFfmpeg(fps: RenderFps): string {
  return fps.den === 1 ? String(fps.num) : `${fps.num}/${fps.den}`
}

export function clampRenderFps(input: number | string | RenderFps, min = 12, max = 60): RenderFps {
  const fps = fpsToNumber(parseRenderFps(input))
  return { num: Math.min(max, Math.max(min, Math.round(fps))), den: 1 }
}

export function estimateBannerDuration(layers: Layer[], fallback = 5): number {
  const maxTime = layers.reduce((max, layer) => {
    const start = finiteNumber(layer.startTime) ?? 0
    const end = finiteNumber(layer.endTime) ?? (start + 3)
    const keyframeEnd = layer.keyframes
      ? Math.max(0, ...Object.values(layer.keyframes).flatMap(kfs => (kfs ?? []).map(kf => finiteNumber(kf.time) ?? 0)))
      : 0
    const motionEnd = layer.motionPathTweens?.length
      ? Math.max(...layer.motionPathTweens.map(tw => finiteNumber(tw.endTime) ?? 0))
      : 0
    return Math.max(max, end, keyframeEnd, motionEnd)
  }, 0)
  return maxTime > 0 ? maxTime : fallback
}

export function buildEngagrFrameRuntimeScript(args: {
  durationSec: number
  fps?: RenderFps
  visibleElements?: Array<{ id: string, type?: string, start?: number, end?: number }>
}): string {
  const duration = Number.isFinite(args.durationSec) && args.durationSec > 0 ? args.durationSec : 5
  const visibleElements = jsonForScript(args.visibleElements ?? [])
  const fps = args.fps ? JSON.stringify(normalizeRenderFps(args.fps)) : 'undefined'
  return `<script>
(function(){
  var diagnostics = [];
  var visibleElements = ${visibleElements};
  var fallbackDuration = ${duration.toFixed(3)};
  function record(code, message) {
    diagnostics.push({ code: code, message: String(message || ''), at: Date.now() });
    if (diagnostics.length > 50) diagnostics.shift();
  }
  function timeline() {
    if (window.__engagrTimeline) return window.__engagrTimeline;
    var g = window.gsap;
    var children = g && g.globalTimeline && g.globalTimeline.getChildren ? g.globalTimeline.getChildren(false) : null;
    return children && children[0] ? children[0] : null;
  }
  function readDuration() {
    var tl = timeline();
    var d = null;
    try {
      if (tl && typeof tl.totalDuration === 'function') d = tl.totalDuration();
      if (!(typeof d === 'number' && isFinite(d) && d > 0) && tl && typeof tl.duration === 'function') d = tl.duration();
    } catch (err) {
      record('duration_failed', err && err.message ? err.message : err);
    }
    return (typeof d === 'number' && isFinite(d) && d > 0) ? d : fallbackDuration;
  }
  function pauseMedia() {
    document.querySelectorAll('video,audio').forEach(function(el) {
      try { if (typeof el.pause === 'function') el.pause(); } catch (err) { record('media_pause_failed', err && err.message ? err.message : err); }
    });
  }
  var runtime = {
    ready: false,
    duration: fallbackDuration,
    fps: ${fps},
    seek: function(timeSeconds) {
      var seekTime = Number(timeSeconds);
      if (!isFinite(seekTime) || seekTime < 0) throw new Error('Invalid seek time');
      var tl = timeline();
      try {
        if (tl && typeof tl.pause === 'function') tl.pause();
        if (tl && typeof tl.seek === 'function') tl.seek(seekTime, false);
        pauseMedia();
        runtime.duration = readDuration();
      } catch (err) {
        record('seek_failed', err && err.message ? err.message : err);
        throw err;
      }
    },
    getDiagnostics: function() {
      return { events: diagnostics.slice(), duration: runtime.duration, hasTimeline: !!timeline() };
    },
    getVisibleElements: function() {
      return visibleElements.slice();
    }
  };
  window.__engagrFrame = runtime;
  runtime.duration = readDuration();
  runtime.ready = true;
})();
</script>`
}

export function buildVisibleElementManifest(layers: Layer[]): Array<{ id: string, type?: string, start?: number, end?: number }> {
  return layers
    .filter(layer => !layer.isMask)
    .map(layer => ({
      id: String(layer.id),
      type: layer.type,
      start: finiteNumber(layer.startTime) ?? 0,
      end: finiteNumber(layer.endTime) ?? ((finiteNumber(layer.startTime) ?? 0) + 3)
    }))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C')
}
