// workers/audio-jobs/container/timelineFiltergraph.mjs — Node port of
// server/utils/audio/timelineFiltergraph.ts. KEEP IN SYNC (the render.ts↔render.mjs
// convention; guarded by test/audio/timelineFiltergraphSync.test.ts).
export function curveToken(curve) {
  if (curve === 'exp') return 'exp'
  if (curve === 'log') return 'log'
  return 'tri'
}
function computeDuration(state, sourceDurations = {}) {
  let max = 0
  for (const track of state.tracks) for (const clip of track.clips) {
    const end = clip.source_out_sec ?? sourceDurations[clip.id] ?? null
    const clipEnd = end == null ? clip.timeline_start_sec : clip.timeline_start_sec + (end - clip.source_in_sec)
    if (clipEnd > max) max = clipEnd
  }
  return max
}
export function duckRatioFromAmountDb(amountDb) {
  const mag = Math.abs(amountDb)
  const ratio = Math.round((1 + mag / 3) * 10) / 10
  return Math.min(20, Math.max(1, ratio))
}
export function duckThresholdLinear(thresholdDb) {
  const linear = Math.pow(10, thresholdDb / 20)
  const clamped = Math.min(1, Math.max(0.000977, linear))
  return Math.round(clamped * 1e6) / 1e6
}
function buildClipAndTrackChains(state) {
  const acc = { inputs: [], chains: [], busLabels: [] }
  const activeTracks = state.tracks.filter((t) => !t.muted)
  let inputIdx = 0
  for (const track of activeTracks) {
    const clipLabels = []
    for (const clip of track.clips) {
      const i = inputIdx++
      acc.inputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      const parts = [`aformat=sample_rates=${state.sample_rate}:channel_layouts=stereo`]
      parts.push(clip.source_out_sec != null ? `atrim=start=${clip.source_in_sec}:end=${clip.source_out_sec}` : `atrim=start=${clip.source_in_sec}`, 'asetpts=N/SR/TB')
      if (clip.timeline_start_sec > 0) parts.push(`adelay=${Math.round(clip.timeline_start_sec * 1000)}:all=1`)
      if (clip.gain_db !== 0) parts.push(`volume=${clip.gain_db}dB`)
      if (clip.fade_in_sec > 0) parts.push(`afade=t=in:st=0:d=${clip.fade_in_sec}:curve=${curveToken(clip.fade_curve)}`)
      const playLen = clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null
      if (clip.fade_out_sec > 0 && playLen != null) parts.push(`afade=t=out:st=${Math.max(0, playLen - clip.fade_out_sec)}:d=${clip.fade_out_sec}:curve=${curveToken(clip.fade_curve)}`)
      const label = `c${i}`
      acc.chains.push(`[${i}:a]${parts.join(',')}[${label}]`)
      clipLabels.push(label)
    }
    if (clipLabels.length === 0) { acc.busLabels.push(''); continue }
    const busLabel = `t${acc.busLabels.length}`
    if (clipLabels.length === 1 && track.gain_db === 0) { acc.busLabels.push(clipLabels[0]) }
    else {
      const ins = clipLabels.map((l) => `[${l}]`).join('')
      const post = track.gain_db !== 0 ? `,volume=${track.gain_db}dB` : ''
      const body = clipLabels.length === 1 ? `[${clipLabels[0]}]anull` : `${ins}amix=inputs=${clipLabels.length}:normalize=0:duration=longest`
      acc.chains.push(`${body}${post}[${busLabel}]`); acc.busLabels.push(busLabel)
    }
  }
  return acc
}
export function finalMixChain(busLabels) {
  const buses = busLabels.filter(Boolean)
  if (buses.length === 0) return null
  if (buses.length === 1) return `[${buses[0]}]alimiter=limit=0.95[mix]`
  return `${buses.map((b) => `[${b}]`).join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,alimiter=limit=0.95[mix]`
}
export function buildTimelineFiltergraph(state) {
  const acc = buildClipAndTrackChains(state)
  const activeTracks = state.tracks.filter((t) => !t.muted)
  const idToBusIdx = new Map()
  activeTracks.forEach((t, k) => idToBusIdx.set(t.id, k))
  let scCount = 0
  for (const rule of state.ducking) {
    const srcK = idToBusIdx.get(rule.source_track_id)
    const tgtK = idToBusIdx.get(rule.target_track_id)
    if (srcK == null || tgtK == null) continue
    const srcLabel = acc.busLabels[srcK]; const tgtLabel = acc.busLabels[tgtK]
    if (!srcLabel || !tgtLabel) continue
    const ruleIdx = scCount++; const keepLabel = `${srcLabel}a`; const scLabel = `sc${ruleIdx}`
    acc.chains.push(`[${srcLabel}]asplit=2[${keepLabel}][${scLabel}]`)
    acc.busLabels[srcK] = keepLabel
    const duckedLabel = `d${ruleIdx}`; const ratio = duckRatioFromAmountDb(rule.amount_db)
    acc.chains.push(`[${tgtLabel}][${scLabel}]sidechaincompress=threshold=${duckThresholdLinear(rule.threshold_db)}:ratio=${ratio}:attack=${rule.attack_ms}:release=${rule.release_ms}[${duckedLabel}]`)
    acc.busLabels[tgtK] = duckedLabel
  }
  const finalChain = finalMixChain(acc.busLabels)
  if (finalChain) acc.chains.push(finalChain)
  return { inputs: acc.inputs, filterComplex: acc.chains.join(';'), outLabel: '[mix]', sampleRate: state.sample_rate, durationSec: computeDuration(state) }
}
export function buildMasterRenderArgs(plan, inputPaths, outputPath) {
  if (inputPaths.length !== plan.inputs.length) throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  const args = ['-hide_banner', '-nostats']
  for (const p of inputPaths) args.push('-i', p)
  args.push('-filter_complex', plan.filterComplex, '-map', plan.outLabel, '-ar', String(plan.sampleRate), '-codec:a', 'pcm_s16le', '-y', outputPath)
  return args
}
