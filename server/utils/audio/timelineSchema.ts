// server/utils/audio/timelineSchema.ts — the Media Studio timeline JSON contract.
// PURE, no I/O. The single source of truth for the shape stored in
// media_timelines.state, imported by BOTH Nitro (~~/server/...) and the
// audio-jobs Worker (relative path, exactly how renderVariants.ts imports
// profiles.ts). Validation/semantics live here so the editor (SP2) and the
// render filtergraph (SP1) never disagree about the contract.
import { z } from 'zod'

const FadeCurve = z.enum(['linear', 'exp', 'log'])

export const ClipSchema = z.object({
  id: z.string().min(1),
  asset_id: z.string().nullable().default(null), // provenance FK → audio_assets; null = uploaded/external
  r2_key: z.string().min(1),                      // source bytes in R2
  timeline_start_sec: z.number(),                 // OTIO timeline-range start
  source_in_sec: z.number().default(0),           // trim head
  source_out_sec: z.number().nullable().default(null), // trim tail; null = play to end
  gain_db: z.number().default(0),
  fade_in_sec: z.number().default(0),
  fade_out_sec: z.number().default(0),
  fade_curve: FadeCurve.default('linear')
})

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['voiceover', 'music', 'sfx']),
  gain_db: z.number().default(0),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),  // lane control reserved for SP3
  hidden: z.boolean().default(false),  // lane control reserved for SP3
  clips: z.array(ClipSchema).default([])
})

export const DuckingRuleSchema = z.object({
  id: z.string().min(1),
  source_track_id: z.string().min(1), // trigger (typically VO)
  target_track_id: z.string().min(1), // ducked bus (typically music)
  amount_db: z.number(),              // attenuation, e.g. -12
  attack_ms: z.number().default(50),
  release_ms: z.number().default(300),
  threshold_db: z.number().default(-30)
})

export const TimelineStateSchema = z.object({
  schema_version: z.literal(1).default(1),
  media_type: z.literal('audio').default('audio'),
  sample_rate: z.number().int().positive().default(48000),
  duration_sec: z.number().default(0), // computed on save via computeDuration
  tracks: z.array(TrackSchema).default([]),
  ducking: z.array(DuckingRuleSchema).default([])
})

export type Clip = z.infer<typeof ClipSchema>
export type Track = z.infer<typeof TrackSchema>
export type DuckingRule = z.infer<typeof DuckingRuleSchema>
export type TimelineState = z.infer<typeof TimelineStateSchema>

export type ValidateResult = { ok: true } | { ok: false; errors: string[] }

/** Referential + semantic integrity beyond Zod's structural check. Pure. */
export function validateTimeline(state: TimelineState): ValidateResult {
  const errors: string[] = []
  const trackIds = new Set<string>()

  for (const track of state.tracks) {
    if (trackIds.has(track.id)) errors.push(`duplicate track id: ${track.id}`)
    trackIds.add(track.id)

    const clipIds = new Set<string>()
    for (const clip of track.clips) {
      if (clipIds.has(clip.id)) errors.push(`duplicate clip id "${clip.id}" in track ${track.id}`)
      clipIds.add(clip.id)
      if (clip.timeline_start_sec < 0) errors.push(`clip ${clip.id}: timeline_start_sec must be >= 0`)
      if (clip.source_in_sec < 0) errors.push(`clip ${clip.id}: source_in_sec must be >= 0`)
      if (clip.source_out_sec != null && clip.source_out_sec <= clip.source_in_sec) {
        errors.push(`clip ${clip.id}: source_out_sec must be > source_in_sec`)
      }
    }
  }

  for (const rule of state.ducking) {
    if (!trackIds.has(rule.source_track_id)) errors.push(`ducking ${rule.id}: source_track_id ${rule.source_track_id} not found`)
    if (!trackIds.has(rule.target_track_id)) errors.push(`ducking ${rule.id}: target_track_id ${rule.target_track_id} not found`)
    if (rule.source_track_id === rule.target_track_id) errors.push(`ducking ${rule.id}: source and target track must differ`)
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}

/**
 * Total timeline length = max(timeline_start_sec + playLength) across clips, where
 * playLength = (source_out_sec ?? sourceDurations[clipId]) - source_in_sec.
 * A clip whose end is unresolvable (null source_out_sec and no supplied duration)
 * contributes only its start offset — making the result a documented LOWER BOUND
 * until SP2 supplies decoded source durations. Pure.
 */
export function computeDuration(state: TimelineState, sourceDurations: Record<string, number> = {}): number {
  let max = 0
  for (const track of state.tracks) {
    for (const clip of track.clips) {
      const end = clip.source_out_sec ?? sourceDurations[clip.id] ?? null
      const clipEnd = end == null
        ? clip.timeline_start_sec
        : clip.timeline_start_sec + (end - clip.source_in_sec)
      if (clipEnd > max) max = clipEnd
    }
  }
  return max
}

/** schema_version upgrade dispatcher. Identity for v1; the explicit seam for the
 * future video/rational-time bump. Pure. */
export function migrateTimeline(state: TimelineState): TimelineState {
  switch (state.schema_version) {
    case 1:
      return state
    default:
      throw new Error(`Unsupported timeline schema_version: ${(state as any).schema_version}`)
  }
}
