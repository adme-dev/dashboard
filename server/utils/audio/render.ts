// server/utils/audio/render.ts — PURE ffmpeg command construction for the render
// tier. No I/O here (the container runs the commands); this is the tested "render
// math" so the argv is verifiable without real audio. 2-pass loudnorm: measure
// (pass 1) → normalize linearly with measured values (pass 2) + trim + fade.
import type { ChannelProfile } from './profiles'

/** Variant R2 key — sits beside the master (mig 149 variants JSONB maps channel→key). */
export function buildVariantKey(clientId: string | null, assetId: string, channel: string, ext: string): string {
  return `audio/${clientId ?? 'org'}/${assetId}/${channel}.${ext}`
}

/** Pass 1: measure loudness. Outputs loudnorm stats as JSON on stderr; no file written. */
export function buildMeasurePassArgs(input: string, p: ChannelProfile): string[] {
  const ln = `loudnorm=I=${p.lufs}:TP=${p.truePeak}:LRA=${p.lra}:print_format=json`
  return ['-hide_banner', '-nostats', '-i', input, '-af', ln, '-f', 'null', '-']
}

export interface LoudnormMeasured {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

/** Parse the JSON object ffmpeg's loudnorm prints to stderr in pass 1. Returns null
 * if the block is absent/malformed (caller falls back to dynamic single-pass). */
export function parseLoudnormJson(stderr: string): LoudnormMeasured | null {
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const obj = JSON.parse(stderr.slice(start, end + 1))
    if (obj && typeof obj.input_i === 'string' && typeof obj.input_tp === 'string') {
      return obj as LoudnormMeasured
    }
  } catch {
    // malformed — fall back
  }
  return null
}

/** Pass 2: normalize to target using measured values (linear, accurate), then
 * optional trim + fade-out, encoded to the channel's delivery format. When
 * `measured` is null, falls back to dynamic single-pass loudnorm. */
export function buildRenderPassArgs(
  input: string,
  output: string,
  p: ChannelProfile,
  measured: LoudnormMeasured | null
): string[] {
  let loudnorm = `loudnorm=I=${p.lufs}:TP=${p.truePeak}:LRA=${p.lra}`
  if (measured) {
    loudnorm += `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}`
      + `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}`
      + `:offset=${measured.target_offset}:linear=true`
  }
  const filters = [loudnorm]
  if (p.fadeOutSec > 0 && p.maxDurationSec) {
    // fade out into the trim point
    filters.push(`afade=t=out:st=${Math.max(0, p.maxDurationSec - p.fadeOutSec)}:d=${p.fadeOutSec}`)
  } else if (p.fadeOutSec > 0) {
    filters.push(`afade=t=out:d=${p.fadeOutSec}`)
  }

  const args = ['-hide_banner', '-nostats', '-i', input, '-af', filters.join(',')]
  if (p.maxDurationSec) args.push('-t', String(p.maxDurationSec))
  if (p.format === 'mp3') args.push('-codec:a', 'libmp3lame', '-q:a', '2')
  else args.push('-codec:a', 'pcm_s16le') // wav
  args.push('-y', output)
  return args
}
