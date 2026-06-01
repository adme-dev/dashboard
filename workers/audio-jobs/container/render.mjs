// workers/audio-jobs/container/render.mjs
// PORT of server/utils/audio/render.ts (which holds the unit tests). Keep the two
// in sync — that file is the canonical, tested source of the ffmpeg "math".
// (Pure JS so the container has no build step beyond `npm`-free node.)

export function buildMeasurePassArgs(input, p) {
  const ln = `loudnorm=I=${p.lufs}:TP=${p.truePeak}:LRA=${p.lra}:print_format=json`
  return ['-hide_banner', '-nostats', '-i', input, '-af', ln, '-f', 'null', '-']
}

export function parseLoudnormJson(stderr) {
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const obj = JSON.parse(stderr.slice(start, end + 1))
    if (obj && typeof obj.input_i === 'string' && typeof obj.input_tp === 'string') return obj
  } catch {
    // malformed — fall back to dynamic
  }
  return null
}

export function buildRenderPassArgs(input, output, p, measured) {
  let loudnorm = `loudnorm=I=${p.lufs}:TP=${p.truePeak}:LRA=${p.lra}`
  if (measured) {
    loudnorm += `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}`
      + `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}`
      + `:offset=${measured.target_offset}:linear=true`
  }
  const filters = [loudnorm]
  if (p.fadeOutSec > 0 && p.maxDurationSec) {
    filters.push(`afade=t=out:st=${Math.max(0, p.maxDurationSec - p.fadeOutSec)}:d=${p.fadeOutSec}`)
  } else if (p.fadeOutSec > 0) {
    filters.push(`afade=t=out:d=${p.fadeOutSec}`)
  }
  const args = ['-hide_banner', '-nostats', '-i', input, '-af', filters.join(',')]
  if (p.maxDurationSec) args.push('-t', String(p.maxDurationSec))
  if (p.format === 'mp3') args.push('-codec:a', 'libmp3lame', '-q:a', '2')
  else args.push('-codec:a', 'pcm_s16le')
  args.push('-y', output)
  return args
}
