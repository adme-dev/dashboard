import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { CaptionStylePreset } from '~~/app/utils/audio/timelineEdit'

export interface VideoStudioClipInspectorSummary {
  clipId: string
  kind: 'video' | 'overlay' | 'caption' | 'audio'
  trackId: string
  trackName: string
  trackKind: string
  label: string
  sourceLabel: string
  startSec: number
  durationSec: number | null
  endSec: number | null
  captionStyle?: CaptionStylePreset
  placement?: { anchor: string; scale: number; margin_pct: number } | null
  details: Array<{ label: string; value: string }>
}

function secondsLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Unresolved'
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))}s`
}

export function resolveVideoStudioClipInspector(input: {
  timeline: TimelineState | null | undefined
  selectedClipId: string | null | undefined
}): VideoStudioClipInspectorSummary | null {
  if (!input.timeline || !input.selectedClipId) return null

  for (const track of input.timeline.tracks) {
    const clip = track.clips.find(candidate => candidate.id === input.selectedClipId)
    if (!clip) continue
    const c = clip as any
    const kind = (c.type ?? 'audio') as VideoStudioClipInspectorSummary['kind']
    const startSec = Number(c.timeline_start_sec ?? 0)
    const durationSec = kind === 'audio'
      ? (c.source_out_sec != null ? Number(c.source_out_sec) - Number(c.source_in_sec ?? 0) : null)
      : Number(c.duration_sec ?? 0)
    const endSec = durationSec == null ? null : startSec + durationSec

    const details: Array<{ label: string; value: string }> = [
      { label: 'Track', value: track.name },
      { label: 'Start', value: secondsLabel(startSec) },
      { label: 'Duration', value: secondsLabel(durationSec) },
      { label: 'End', value: secondsLabel(endSec) },
    ]

    if (kind === 'video') {
      details.push(
        { label: 'Source', value: c.base_source === 'still_kenburns' ? 'Still' : 'Footage' },
        { label: 'Audio', value: String(c.audio_mode ?? 'mute').replace(/_/g, ' ') },
        { label: 'Effects', value: Array.isArray(c.effects) && c.effects.length ? String(c.effects.length) : 'None' },
      )
    } else if (kind === 'overlay') {
      details.push(
        { label: 'Project', value: c.gsap_project_id },
        { label: 'Format', value: c.gsap_format_key ?? 'Default' },
        { label: 'Opacity', value: String(c.opacity ?? 1) },
      )
    } else if (kind === 'caption') {
      details.push(
        { label: 'Text', value: String(c.text ?? '').slice(0, 80) },
        { label: 'Style', value: String(c.style ?? 'platform_default').replace(/_/g, ' ') },
      )
    } else {
      details.push(
        { label: 'Source in', value: secondsLabel(Number(c.source_in_sec ?? 0)) },
        { label: 'Gain', value: `${Number(c.gain_db ?? 0)} dB` },
      )
    }

    return {
      clipId: c.id,
      kind,
      trackId: track.id,
      trackName: track.name,
      trackKind: track.kind,
      label: kind === 'video'
        ? (c.base_source === 'still_kenburns' ? 'Still clip' : 'Footage clip')
        : kind === 'overlay' ? 'Overlay clip'
          : kind === 'caption' ? 'Caption clip'
            : 'Audio clip',
      sourceLabel: kind === 'overlay'
        ? c.gsap_project_id
        : kind === 'caption'
          ? String(c.text ?? '').slice(0, 40)
          : c.r2_key,
      startSec,
      durationSec,
      endSec,
      captionStyle: kind === 'caption' ? (c.style ?? 'platform_default') : undefined,
      placement: kind === 'overlay' ? (c.placement ?? null) : undefined,
      details,
    }
  }

  return null
}
