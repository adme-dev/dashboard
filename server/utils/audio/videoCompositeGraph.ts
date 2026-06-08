// PURE timeline → ffmpeg composite args (base video + audio bed). No I/O.
// Dual-imported by Nitro and the audio-jobs Container (.mjs port). Overlay tracks
// are IGNORED in V1.2a (V1.2b composites the alpha overlay layer).
import type { TimelineState } from './timelineSchema'
import { computeDuration } from './timelineSchema'
import { buildTimelineFiltergraph, type FiltergraphInput } from './timelineFiltergraph'
import type { VideoFormat } from './videoProfiles'

export interface CompositePlan {
  inputs: FiltergraphInput[]   // video-clip inputs first, then audio-clip inputs
  filterComplex: string
  vLabel: string               // '[vout]'
  aLabel: string | null        // '[aout]' or null when no audio tracks
  durationSec: number
  profile: VideoFormat
}

const AUDIO_KINDS = ['voiceover', 'music', 'sfx']

function kenburnsExpr(k: any, W: number, H: number, fps: number, dur: number): string {
  const zf = k?.zoom_from ?? 1, zt = k?.zoom_to ?? 1.1
  const frames = Math.max(1, Math.round(dur * fps))
  // linear zoom from zf→zt over the clip; centered. Pan kept simple in V1.2a.
  const step = ((zt - zf) / frames).toFixed(6)
  return `zoompan=z='${zf}+${step}*on':d=${frames}:s=${W}x${H}:fps=${fps}`
}

export function buildCompositePlan(state: TimelineState, profile: VideoFormat): CompositePlan {
  const W = profile.width, H = profile.height, fps = profile.fps
  const duration = computeDuration(state)

  // --- video base chain ---
  const videoInputs: FiltergraphInput[] = []
  const vChains: string[] = [`color=c=black:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)}[vb0]`]
  let baseLabel = 'vb0', baseN = 0, idx = 0

  for (const track of state.tracks.filter(t => t.kind === 'video' && !t.muted)) {
    for (const clip of track.clips as any[]) {
      const i = idx++
      videoInputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      const start = clip.timeline_start_sec, dur = clip.duration_sec
      const parts: string[] = []
      if (clip.base_source === 'still_kenburns') {
        parts.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, kenburnsExpr(clip.kenburns, W, H, fps, dur))
      } else {
        parts.push(
          clip.source_out_sec != null ? `trim=start=${clip.source_in_sec}:end=${clip.source_out_sec}` : `trim=start=${clip.source_in_sec}`,
          'setpts=PTS-STARTPTS',
          `scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
        )
      }
      parts.push(`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`)
      const clipLabel = `vc${i}`
      vChains.push(`[${i}:v]${parts.join(',')}[${clipLabel}]`)
      const outLabel = `vb${++baseN}`
      vChains.push(`[${baseLabel}][${clipLabel}]overlay=enable='between(t,${start.toFixed(3)},${(start + dur).toFixed(3)})'[${outLabel}]`)
      baseLabel = outLabel
    }
  }
  vChains.push(`[${baseLabel}]format=yuv420p[vout]`)

  // --- audio bed: reuse the audio filtergraph, offset its [k:a] inputs by V ---
  const V = videoInputs.length
  const audioState = { ...state, tracks: state.tracks.filter(t => AUDIO_KINDS.includes(t.kind)) } as TimelineState
  const audioPlan = buildTimelineFiltergraph(audioState)
  const hasAudio = audioPlan.inputs.length > 0
  const offsetAudio = hasAudio
    ? audioPlan.filterComplex.replace(/\[(\d+):a\]/g, (_m, n) => `[${Number(n) + V}:a]`).replace(/\[mix\]/g, '[aout]')
    : ''

  const filterComplex = [...vChains, offsetAudio].filter(Boolean).join(';')

  return {
    inputs: [...videoInputs, ...audioPlan.inputs],
    filterComplex,
    vLabel: '[vout]',
    aLabel: hasAudio ? '[aout]' : null,
    durationSec: duration,
    profile
  }
}

export function buildCompositeRenderArgs(plan: CompositePlan, inputPaths: string[], outputPath: string): string[] {
  if (inputPaths.length !== plan.inputs.length) {
    throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  }
  const args = ['-hide_banner', '-nostats']
  for (const p of inputPaths) args.push('-i', p)
  args.push('-filter_complex', plan.filterComplex, '-map', plan.vLabel)
  if (plan.aLabel) args.push('-map', plan.aLabel)
  args.push('-r', String(plan.profile.fps), '-c:v', 'libx264', '-b:v', plan.profile.videoBitrate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (plan.aLabel) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-shortest', '-y', outputPath)
  return args
}
