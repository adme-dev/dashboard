// workers/audio-jobs/container/videoCompositeGraph.mjs — Node port of
// server/utils/audio/videoCompositeGraph.ts. KEEP IN SYNC (the render.ts↔render.mjs
// convention; guarded by test/audio/videoCompositeGraphSync.test.ts).
// V1.2b: overlays are transparent PNG image-sequences alpha-composited onto [vout].
import { buildTimelineFiltergraph } from './timelineFiltergraph.mjs'

const AUDIO_KINDS = ['voiceover', 'music', 'sfx']

function computeDuration(state) {
  let max = 0
  for (const track of state.tracks) {
    for (const clip of track.clips) {
      const type = clip.type ?? 'audio'
      let clipEnd
      if (type === 'audio') {
        const end = clip.source_out_sec ?? null
        clipEnd = end == null ? clip.timeline_start_sec : clip.timeline_start_sec + (end - (clip.source_in_sec ?? 0))
      } else {
        clipEnd = clip.timeline_start_sec + clip.duration_sec
      }
      if (clipEnd > max) max = clipEnd
    }
  }
  return max
}

// Per-clip effect presets → ffmpeg filter strings. Inserted into the clip chain
// after scaling, before the timeline-offset setpts. Unknown ids are ignored so a
// newer editor can save presets an older renderer doesn't know without breaking.
export const CLIP_EFFECT_PRESETS = {
  film_grain: 'noise=alls=12:allf=t+u',
  motion_blur: 'tmix=frames=4',
  vhs: 'noise=c0s=14:c0f=t+u,eq=saturation=1.3:contrast=0.92:brightness=0.02',
  shake: 'crop=in_w-16:in_h-16:8+6*sin(t*13):8+6*cos(t*17),scale=iw+16:ih+16',
  bloom: 'eq=brightness=0.06:saturation=1.12,gblur=sigma=0.6',
  fisheye: 'lenscorrection=k1=0.32:k2=0.12'
}

export function clipEffectFilters(effects) {
  return (effects ?? []).map(id => CLIP_EFFECT_PRESETS[id]).filter(Boolean)
}

function kenburnsExpr(k, W, H, fps, dur) {
  const zf = k?.zoom_from ?? 1, zt = k?.zoom_to ?? 1.1
  const frames = Math.max(1, Math.round(dur * fps))
  const step = ((zt - zf) / frames).toFixed(6)
  return `zoompan=z='${zf}+${step}*on':d=${frames}:s=${W}x${H}:fps=${fps}`
}

export function buildCompositePlan(state, profile, overlays = []) {
  const W = profile.width, H = profile.height, fps = profile.fps
  const duration = computeDuration(state)

  // --- video base chain ---
  const videoInputs = []
  const vChains = [`color=c=black:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)}[vb0]`]
  let baseLabel = 'vb0', baseN = 0, idx = 0

  for (const track of state.tracks.filter(t => t.kind === 'video' && !t.muted)) {
    for (const clip of track.clips) {
      const i = idx++
      videoInputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      const start = clip.timeline_start_sec, dur = clip.duration_sec
      const parts = []
      if (clip.base_source === 'still_kenburns') {
        parts.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, kenburnsExpr(clip.kenburns, W, H, fps, dur))
      } else {
        parts.push(
          clip.source_out_sec != null ? `trim=start=${clip.source_in_sec}:end=${clip.source_out_sec}` : `trim=start=${clip.source_in_sec}`,
          'setpts=PTS-STARTPTS',
          `scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
        )
      }
      parts.push(...clipEffectFilters(clip.effects))
      parts.push(`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`)
      const clipLabel = `vc${i}`
      vChains.push(`[${i}:v]${parts.join(',')}[${clipLabel}]`)
      const outLabel = `vb${++baseN}`
      vChains.push(`[${baseLabel}][${clipLabel}]overlay=enable='between(t,${start.toFixed(3)},${(start + dur).toFixed(3)})'[${outLabel}]`)
      baseLabel = outLabel
    }
  }

  // --- audio bed: reuse the audio filtergraph, offset its [k:a] inputs by V ---
  const V = videoInputs.length
  const audioState = { ...state, tracks: state.tracks.filter(t => AUDIO_KINDS.includes(t.kind)) }
  const audioPlan = buildTimelineFiltergraph(audioState)
  const hasAudio = audioPlan.inputs.length > 0
  const offsetAudio = hasAudio
    ? audioPlan.filterComplex.replace(/\[(\d+):a\]/g, (_m, n) => `[${Number(n) + V}:a]`).replace(/\[mix\]/g, '[aout]')
    : ''

  // --- V1.2b: overlay frame-sequence compositing ---
  // Overlay inputs are added AFTER video + audio inputs in the ffmpeg -i list.
  // Input index for overlay N = V + audioInputs.length + N
  const A = audioPlan.inputs.length
  if (overlays.length > 0) {
    for (let ovIdx = 0; ovIdx < overlays.length; ovIdx++) {
      const ov = overlays[ovIdx]
      const inputIdx = V + A + ovIdx
      const ovLabel = `ov${ovIdx}`
      const nextLabel = `vb${++baseN}`
      // The overlay frame-sequence input is referenced by its input index as a video stream
      vChains.push(`[${inputIdx}:v]setpts=PTS-STARTPTS+${ov.timeline_start_sec.toFixed(3)}/TB[${ovLabel}]`)
      vChains.push(`[${baseLabel}][${ovLabel}]overlay=enable='between(t,${ov.timeline_start_sec.toFixed(3)},${(ov.timeline_start_sec + ov.duration_sec).toFixed(3)})'[${nextLabel}]`)
      baseLabel = nextLabel
    }
  }
  vChains.push(`[${baseLabel}]format=yuv420p[vout]`)

  const filterComplex = [...vChains, offsetAudio].filter(Boolean).join(';')

  return {
    inputs: [...videoInputs, ...audioPlan.inputs],
    filterComplex,
    vLabel: '[vout]',
    aLabel: hasAudio ? '[aout]' : null,
    durationSec: duration,
    profile,
    overlayInputs: overlays
  }
}

export function buildCompositeRenderArgs(plan, inputPaths, outputPath) {
  if (inputPaths.length !== plan.inputs.length) {
    throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  }
  const args = ['-hide_banner', '-nostats']
  // Regular video + audio inputs (must come first, matching plan.inputs order)
  for (const p of inputPaths) args.push('-i', p)
  // Overlay frame-sequence inputs come after, matching filtergraph input indices
  for (const ov of plan.overlayInputs) {
    args.push('-framerate', String(ov.fps), '-i', ov.framesPattern)
  }
  args.push('-filter_complex', plan.filterComplex, '-map', plan.vLabel)
  if (plan.aLabel) args.push('-map', plan.aLabel)
  args.push('-r', String(plan.profile.fps), '-c:v', 'libx264', '-b:v', plan.profile.videoBitrate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (plan.aLabel) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-shortest', '-y', outputPath)
  return args
}
