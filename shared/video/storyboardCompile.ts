/** Pure compilation. Only the server resolver may construct trusted inputs.
 * Returned obligations must be persisted by T06, never accepted from clients. */
import type { AssetBinding, ReadinessFinding, StoryboardPlan } from './storyboard'
import { validateStoryboardPlan } from './storyboardValidation'
import { TimelineStateSchema, type TimelineState, type Clip, type Track } from '../../server/utils/audio/timelineSchema'

export const storyboardFormats = {
  reels_9x16: { width: 1080, height: 1920, banner: 'fb_story' },
  youtube_16x9: { width: 1920, height: 1080, banner: 'tt_land' },
  square_1x1: { width: 1080, height: 1080, banner: 'ig_sq' }
} as const
export type StoryboardFormat = keyof typeof storyboardFormats
export interface ResolvedMedia {
  assetId: string
  contentHash: string
  kind: 'video' | 'image' | 'audio'
  r2Key: string
  durationSeconds: number | null
  width?: number
  height?: number
  /** Canonical recorded spoken text; never a candidate/client transcript. */
  speechText?: string
}
export interface ResolvedOverlay {
  assetId: string
  contentHash: string
  copyCueId: string
  text: string
  layouts: Partial<Record<StoryboardFormat, { formatKey: string, layoutHash: string }>>
}
export interface ResolvedStoryboard {
  plan: StoryboardPlan
  formats: StoryboardFormat[]
  assets: Record<string, ResolvedMedia>
  /** Shot/cue identity, because one Banner may carry different cues. */
  overlays: Record<string, ResolvedOverlay>
  findings: ReadinessFinding[]
}
export interface StoryboardObligations {
  revisionId: string
  copyRevisionId: string
  copyHash: string
  sources: Array<{ clipId: string, shotId: string, sourceKind: string, assetId: string, contentHash: string, startFrame: number, durationFrames: number, sourceInFrames: number }>
  cues: Array<{ clipId: string, shotId: string, cueId: string, copyId: string, text: string, required: boolean, startFrame: number, durationFrames: number, layouts?: ResolvedOverlay['layouts'] }>
}
export type StoryboardCompileResult = { ok: false, findings: ReadinessFinding[] } | { ok: true, findings: ReadinessFinding[], timeline: TimelineState, obligations: StoryboardObligations }

export function compileStoryboard(resolved: ResolvedStoryboard): StoryboardCompileResult {
  const { plan } = resolved
  const findings = [...resolved.findings]
  const block = (code: string, shotId?: string) => findings.push({ code, shotId, severity: 'blocker', message: `Storyboard is not ready: ${code.replaceAll('_', ' ')}.` })
  const valid = validateStoryboardPlan(plan)
  if (valid.ok === false) return { ok: false, findings: [...findings, ...valid.findings] }
  if (!plan.copy.approval) block('copy_not_approved')
  if (!resolved.formats.length || !resolved.formats.includes(plan.targetFormat) || resolved.formats.some(f => !storyboardFormats[f])) block('invalid_formats')
  const dimensions = storyboardFormats[plan.targetFormat]
  const timeline = TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', fps: plan.fps, ...dimensions, duration_sec: plan.durationFrames / plan.fps,
    tracks: ['video', 'voiceover', 'music', 'sfx', 'caption', 'overlay'].map(kind => ({ id: `sb-${kind}`, name: kind, kind, clips: [] })) })
  const obligations: StoryboardObligations = { revisionId: plan.revision, copyRevisionId: plan.copyRevisionId, copyHash: plan.copy.contentHash, sources: [], cues: [] }
  const track = (kind: Track['kind']) => timeline.tracks.find(t => t.kind === kind)!
  const clipId = (shot: string, cue: string) => `sb:${plan.revision}:${shot}:${cue}`
  const add = (kind: Track['kind'], shotId: string, cueId: string, clip: Record<string, unknown>) => {
    const id = clipId(shotId, cueId)
    track(kind).clips.push({ ...clip, id, storyboard: { revisionId: plan.revision, shotId, cueId } } as Clip)
    return id
  }
  function media(binding: AssetBinding, shotId: string, cueId: string, start: number, duration: number, lane: 'video' | 'voiceover' | 'music' | 'sfx') {
    if (binding.status !== 'bound') {
      block('media_unresolved', shotId)
      return
    }
    const asset = resolved.assets[`${binding.sourceKind}:${binding.assetId}`]
    if (!asset || asset.contentHash !== binding.contentHash) {
      block('media_unresolved', shotId)
      return
    }
    if ((lane === 'video' && asset.kind === 'audio') || (lane !== 'video' && asset.kind !== 'audio')) {
      block('invalid_media_kind', shotId)
      return
    }
    const sourceIn = binding.sourceInFrames ?? 0
    const sourceOut = binding.sourceOutFrames ?? sourceIn + duration
    if (sourceOut - sourceIn !== duration) {
      block('source_range_mismatch', shotId)
      return
    }
    if (asset.kind !== 'image') {
      if (!(asset.durationSeconds !== null && Number.isFinite(asset.durationSeconds) && asset.durationSeconds > 0)) {
        block('media_unmeasured', shotId)
        return
      }
      if (sourceOut / plan.fps > asset.durationSeconds + 1e-9) {
        block('source_too_short', shotId)
        return
      }
    }
    // No server-owned text-to-subrange evidence exists in R1. Keep the complete
    // recording, rounded down only to its final complete project frame.
    if (lane === 'voiceover' && (sourceIn !== 0 || sourceOut !== Math.floor(asset.durationSeconds! * plan.fps + 1e-6))) {
      block('voice_source_range_unreviewed', shotId)
      return
    }
    const id = add(lane, shotId, `${lane}:${cueId}`, { type: lane === 'video' ? 'video' : 'audio', asset_id: binding.sourceKind === 'source_asset' ? null : asset.assetId, r2_key: asset.r2Key,
      timeline_start_sec: start / plan.fps, source_in_sec: sourceIn / plan.fps, source_out_sec: sourceOut / plan.fps,
      ...(lane === 'video' ? { duration_sec: duration / plan.fps, base_source: asset.kind === 'image' ? 'still_kenburns' : 'uploaded_footage', kenburns: asset.kind === 'image' ? {} : null, fit: 'fit', audio_mode: 'mute' } : {}) })
    obligations.sources.push({ clipId: id, shotId, sourceKind: binding.sourceKind, assetId: asset.assetId, contentHash: asset.contentHash, startFrame: start, durationFrames: duration, sourceInFrames: sourceIn })
    return asset
  }
  let offset = 0
  for (const shot of plan.shots) {
    media(shot.visual, shot.id, 'visual', offset, shot.durationFrames, 'video')
    const voices = shot.audioCues.filter(c => c.kind === 'voiceover' && c.timing === 'reviewed' && c.asset.status === 'bound')
    const voice = voices[0]
    const speechText = shot.spokenSegmentIds.map(id => plan.copy.scriptSegments.find(s => s.id === id)!.text).join('\n')
    if ((shot.spokenSegmentIds.length > 0 || voices.length > 0) && (voices.length !== 1 || !voice || resolved.assets[`audio_asset:${voice.asset.status === 'bound' ? voice.asset.assetId : ''}`]?.speechText !== speechText)) block('voice_timing_unresolved', shot.id)
    for (const cue of shot.audioCues) {
      if (cue.asset.status === 'omitted') continue
      if (cue.timing !== 'reviewed') block('audio_timing_unresolved', shot.id)
      media(cue.asset, shot.id, cue.id, offset + cue.startFrame, cue.durationFrames, cue.kind)
    }
    for (const cue of shot.captionCues) {
      if (cue.timing !== 'reviewed') block('caption_timing_unresolved', shot.id)
      if (!voices.some(v => cue.startFrame >= v.startFrame && cue.startFrame + cue.durationFrames <= v.startFrame + v.durationFrames)) block('caption_outside_speech', shot.id)
      const text = plan.copy.scriptSegments.find(s => s.id === cue.spokenSegmentId)!.text
      const id = add('caption', shot.id, `caption:${cue.id}`, { type: 'caption', text, timeline_start_sec: (offset + cue.startFrame) / plan.fps, duration_sec: cue.durationFrames / plan.fps })
      obligations.cues.push({ clipId: id, shotId: shot.id, cueId: cue.id, copyId: cue.spokenSegmentId, text, required: true, startFrame: offset + cue.startFrame, durationFrames: cue.durationFrames })
    }
    for (const copyId of shot.copyCueIds) {
      if (plan.copy.cues.find(c => c.id === copyId)?.required && !shot.overlayCues.some(c => c.copyCueId === copyId)) block('required_overlay_missing', shot.id)
    }
    for (const cue of shot.overlayCues) {
      const copy = plan.copy.cues.find(c => c.id === cue.copyCueId)!
      const overlay = resolved.overlays[`${shot.id}:${cue.id}`]
      if (cue.asset.status !== 'bound' || !overlay || overlay.assetId !== cue.asset.assetId || overlay.contentHash !== cue.asset.contentHash || overlay.copyCueId !== copy.id || overlay.text !== copy.text
        || resolved.formats.some(f => !overlay.layouts[f])) {
        block('overlay_unresolved', shot.id)
        continue
      }
      const id = add('overlay', shot.id, `overlay:${cue.id}`, { type: 'overlay', gsap_project_id: overlay.assetId, gsap_format_key: overlay.layouts[plan.targetFormat]!.formatKey, timeline_start_sec: (offset + cue.startFrame) / plan.fps, duration_sec: cue.durationFrames / plan.fps, opacity: 1, placement: { anchor: 'center', scale: 1, margin_pct: 0 } })
      obligations.cues.push({ clipId: id, shotId: shot.id, cueId: cue.id, copyId: copy.id, text: copy.text, required: copy.required, startFrame: offset + cue.startFrame, durationFrames: cue.durationFrames, layouts: overlay.layouts })
      obligations.sources.push({ clipId: id, shotId: shot.id, sourceKind: 'banner_project', assetId: overlay.assetId, contentHash: overlay.contentHash, startFrame: offset + cue.startFrame, durationFrames: cue.durationFrames, sourceInFrames: 0 })
    }
    offset += shot.durationFrames
  }
  return findings.some(f => f.severity === 'blocker') ? { ok: false, findings } : { ok: true, findings, timeline: TimelineStateSchema.parse(timeline), obligations }
}

/** Pure diff for T06/T08's server-owned lineage. Call with server-loaded baseline
 * and obligations. Metadata, selection, names and editor zoom confer no authority. */
export function storyboardApprovalChanges(before: TimelineState, after: TimelineState, obligations: StoryboardObligations): Array<{ clipId: string, reasons: Array<'presence' | 'source' | 'timing' | 'layout' | 'copy'> }> {
  const ids = new Set([...obligations.sources, ...obligations.cues].map(item => item.clipId))
  const locate = (state: TimelineState, id: string) => state.tracks.flatMap(track => track.clips.filter(c => c.id === id).map(clip => ({ track, clip })))
  const duckingSignature = (state: TimelineState, targetId: string) => JSON.stringify(state.ducking
    .filter(rule => rule.target_track_id === targetId)
    .map((rule) => {
      const source = state.tracks.find(track => track.id === rule.source_track_id)
      return { rule, source: source
        ? { gain: source.gain_db, muted: source.muted, hidden: source.hidden, clips: source.clips.map((clip) => {
            const { storyboard: _provenance, ...content } = clip
            return content
          }) }
        : null }
    }).sort((a, b) => a.rule.id.localeCompare(b.rule.id)))
  const results: ReturnType<typeof storyboardApprovalChanges> = []
  for (const clipId of ids) {
    const previous = locate(before, clipId)
    const current = locate(after, clipId)
    const reasons: ReturnType<typeof storyboardApprovalChanges>[number]['reasons'] = []
    if (previous.length !== 1 || current.length !== 1 || current[0]!.track.hidden || current[0]!.track.muted) reasons.push('presence')
    else {
      const a = previous[0]!.clip as unknown as Record<string, unknown>
      const b = current[0]!.clip as unknown as Record<string, unknown>
      const differs = (fields: string[]) => fields.some(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
      if (differs(['type', 'base_source', 'asset_id', 'r2_key', 'gsap_project_id', 'source_asset_id', 'caption_vtt_url'])) reasons.push('source')
      if (differs(['timeline_start_sec', 'source_in_sec', 'source_out_sec', 'duration_sec', 'gain_db', 'fade_in_sec', 'fade_out_sec', 'fade_curve', 'audio_mode']) || before.fps !== after.fps || previous[0]!.track.gain_db !== current[0]!.track.gain_db
        || (b.type === 'audio' && duckingSignature(before, previous[0]!.track.id) !== duckingSignature(after, current[0]!.track.id))) reasons.push('timing')
      if (differs(['placement', 'opacity', 'gsap_format_key', 'fit', 'kenburns', 'effects', 'style']) || before.width !== after.width || before.height !== after.height || previous[0]!.track.kind !== current[0]!.track.kind) reasons.push('layout')
      if (differs(['text'])) reasons.push('copy')
    }
    if (reasons.length) results.push({ clipId, reasons })
  }
  return results
}
