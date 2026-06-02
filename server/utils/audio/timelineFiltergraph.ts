// server/utils/audio/timelineFiltergraph.ts — PURE timeline → ffmpeg filter_complex.
// No I/O. Index-based labels: ffmpeg input i → clip chain [ci]; track bus [tk];
// ducked target [dk]; final [mix]. The single source of truth for the render graph,
// imported by Nitro (~~/) and ported (kept in sync) into the audio-jobs Container —
// exactly the render.ts ↔ container/render.mjs convention. Validation/duration math
// live in timelineSchema.ts; this file compiles a *validated* state to ffmpeg args.
import type { TimelineState } from './timelineSchema'
import { computeDuration } from './timelineSchema'

export interface FiltergraphInput {
  clipId: string
  r2_key: string
}

export interface FiltergraphPlan {
  inputs: FiltergraphInput[] // index = ffmpeg -i order; the container resolves to local paths
  filterComplex: string
  outLabel: string           // always '[mix]' (see Task 2)
  sampleRate: number
  durationSec: number
}

/** contract fade curve → ffmpeg afade `curve=` token. 'tri' is ffmpeg's linear ramp. */
export function curveToken(curve: 'linear' | 'exp' | 'log'): string {
  switch (curve) {
    case 'exp': return 'exp'
    case 'log': return 'log'
    default: return 'tri'
  }
}

interface BuildAccum {
  inputs: FiltergraphInput[]
  chains: string[]
  /** current bus label per active (non-muted) track, e.g. 'c0' or 't1'. */
  busLabels: string[]
}

/** Build per-clip chains + per-track buses. Mutates `acc`. Exported-internal for Task 2. */
export function buildClipAndTrackChains(state: TimelineState): BuildAccum {
  const acc: BuildAccum = { inputs: [], chains: [], busLabels: [] }
  const activeTracks = state.tracks.filter((t) => !t.muted)
  let inputIdx = 0

  for (const track of activeTracks) {
    const clipLabels: string[] = []
    for (const clip of track.clips) {
      const i = inputIdx++
      acc.inputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      // aformat FIRST — normalise rate/layout before any amix (prior-art: the #1
      // silent amix failure). Applied at source so track + final amix are both safe.
      const parts: string[] = [`aformat=sample_rates=${state.sample_rate}:channel_layouts=stereo`]
      parts.push(
        clip.source_out_sec != null
          ? `atrim=start=${clip.source_in_sec}:end=${clip.source_out_sec}`
          : `atrim=start=${clip.source_in_sec}`,
        'asetpts=N/SR/TB'
      )
      if (clip.timeline_start_sec > 0) {
        parts.push(`adelay=${Math.round(clip.timeline_start_sec * 1000)}:all=1`)
      }
      if (clip.gain_db !== 0) parts.push(`volume=${clip.gain_db}dB`)
      if (clip.fade_in_sec > 0) {
        parts.push(`afade=t=in:st=0:d=${clip.fade_in_sec}:curve=${curveToken(clip.fade_curve)}`)
      }
      const playLen = clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null
      if (clip.fade_out_sec > 0 && playLen != null) {
        const st = Math.max(0, playLen - clip.fade_out_sec)
        parts.push(`afade=t=out:st=${st}:d=${clip.fade_out_sec}:curve=${curveToken(clip.fade_curve)}`)
      }
      const label = `c${i}`
      acc.chains.push(`[${i}:a]${parts.join(',')}[${label}]`)
      clipLabels.push(label)
    }

    // per-track bus
    if (clipLabels.length === 0) {
      acc.busLabels.push('') // empty active track contributes nothing
      continue
    }
    const busLabel = `t${acc.busLabels.length}`
    if (clipLabels.length === 1 && track.gain_db === 0) {
      acc.busLabels.push(clipLabels[0]) // reuse clip label; no extra filter node
    } else {
      const ins = clipLabels.map((l) => `[${l}]`).join('')
      const post = track.gain_db !== 0 ? `,volume=${track.gain_db}dB` : ''
      const body = clipLabels.length === 1 ? `[${clipLabels[0]}]anull` : `${ins}amix=inputs=${clipLabels.length}:normalize=0:duration=longest`
      acc.chains.push(`${body}${post}[${busLabel}]`)
      acc.busLabels.push(busLabel)
    }
  }
  return acc
}

/** Final master mix of the surviving track buses: amix (duration=longest, since
 * clips are positioned by adelay) then alimiter (prior-art: prevent post-mix WAV
 * clipping before the per-channel loudnorm). Always alimiter-guarded, even for one bus. */
export function finalMixChain(busLabels: string[]): string | null {
  const buses = busLabels.filter(Boolean)
  if (buses.length === 0) return null
  if (buses.length === 1) return `[${buses[0]}]alimiter=limit=0.95[mix]`
  return `${buses.map((b) => `[${b}]`).join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,alimiter=limit=0.95[mix]`
}

// buildTimelineFiltergraph (with ducking) is completed in Task 2.
export function buildTimelineFiltergraph(state: TimelineState): FiltergraphPlan {
  const acc = buildClipAndTrackChains(state)
  const finalChain = finalMixChain(acc.busLabels)
  if (finalChain) acc.chains.push(finalChain)
  return {
    inputs: acc.inputs,
    filterComplex: acc.chains.join(';'),
    outLabel: '[mix]',
    sampleRate: state.sample_rate,
    durationSec: computeDuration(state)
  }
}
