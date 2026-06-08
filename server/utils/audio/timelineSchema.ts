// server/utils/audio/timelineSchema.ts — the Media Studio timeline JSON contract.
// PURE, no I/O. The single source of truth for the shape stored in
// media_timelines.state, imported by BOTH Nitro (~~/server/...) and the
// audio-jobs Worker (relative path, exactly how renderVariants.ts imports
// profiles.ts). Validation/semantics live here so the editor (SP2) and the
// render filtergraph (SP1) never disagree about the contract.
import { z } from 'zod'

const FadeCurve = z.enum(['linear', 'exp', 'log'])

// ── Audio clip (v1-compatible) ────────────────────────────────────────────────
export const AudioClipSchema = z.object({
  type: z.literal('audio'),
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

// ── Video / still clip ────────────────────────────────────────────────────────
export const KenBurnsSchema = z.object({
  zoom_from: z.number().default(1),
  zoom_to: z.number().default(1.1),
  pan_from: z.tuple([z.number(), z.number()]).default([0, 0]),
  pan_to: z.tuple([z.number(), z.number()]).default([0, 0])
})

export const VideoClipSchema = z.object({
  type: z.literal('video'),
  id: z.string().min(1),
  asset_id: z.string().nullable().default(null),
  r2_key: z.string().min(1),
  timeline_start_sec: z.number(),
  source_in_sec: z.number().default(0),
  source_out_sec: z.number().nullable().default(null),
  duration_sec: z.number(),
  base_source: z.enum(['uploaded_footage', 'still_kenburns']),
  kenburns: KenBurnsSchema.nullable().default(null),
  audio_mode: z.enum(['mute', 'source', 'duck_under_vo']).default('mute')
})

// ── GSAP overlay clip ─────────────────────────────────────────────────────────
export const OverlayClipSchema = z.object({
  type: z.literal('overlay'),
  id: z.string().min(1),
  timeline_start_sec: z.number(),
  duration_sec: z.number(),
  gsap_project_id: z.string().min(1),
  gsap_format_key: z.string().nullable().default(null),
  opacity: z.number().default(1)
})

// ── Discriminated union — legacy audio clips have no `type`; inject 'audio'
//    before discriminating so shipped v1 documents parse unchanged. ───────────
export const ClipSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !Array.isArray(v) && !('type' in (v as any)))
    ? { ...(v as any), type: 'audio' }
    : v,
  z.discriminatedUnion('type', [AudioClipSchema, VideoClipSchema, OverlayClipSchema])
)

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['voiceover', 'music', 'sfx', 'video', 'overlay']),
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
  schema_version: z.union([z.literal(1), z.literal(2)]).default(1),
  media_type: z.enum(['audio', 'av']).default('audio'),
  sample_rate: z.number().int().positive().default(48000),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  duration_sec: z.number().default(0), // computed on save via computeDuration
  tracks: z.array(TrackSchema).default([]),
  ducking: z.array(DuckingRuleSchema).default([])
})

export type AudioClip = z.infer<typeof AudioClipSchema>
export type VideoClip = z.infer<typeof VideoClipSchema>
export type OverlayClip = z.infer<typeof OverlayClipSchema>
export type Clip = z.infer<typeof ClipSchema>
export type Track = z.infer<typeof TrackSchema>
export type DuckingRule = z.infer<typeof DuckingRuleSchema>
export type TimelineState = z.infer<typeof TimelineStateSchema>

export type ValidateResult = { ok: true } | { ok: false; errors: string[] }

/** Referential + semantic integrity beyond Zod's structural check. Pure. */
export function validateTimeline(state: TimelineState): ValidateResult {
  const errors: string[] = []
  const trackIds = new Set<string>()

  const expectedClipType: Record<string, 'audio' | 'video' | 'overlay'> = {
    voiceover: 'audio', music: 'audio', sfx: 'audio', video: 'video', overlay: 'overlay'
  }

  for (const track of state.tracks) {
    if (trackIds.has(track.id)) errors.push(`duplicate track id: ${track.id}`)
    trackIds.add(track.id)

    const clipIds = new Set<string>()
    for (const clip of track.clips) {
      const c = clip as any
      if (clipIds.has(c.id)) errors.push(`duplicate clip id "${c.id}" in track ${track.id}`)
      clipIds.add(c.id)

      const want = expectedClipType[track.kind]
      const got = c.type ?? 'audio'
      if (want && got !== want) {
        errors.push(`clip ${clip.id}: type "${got}" does not match track kind "${track.kind}"`)
      }
      if (got === 'audio') {
        if (c.timeline_start_sec < 0) errors.push(`clip ${c.id}: timeline_start_sec must be >= 0`)
        if (c.source_in_sec < 0) errors.push(`clip ${c.id}: source_in_sec must be >= 0`)
        if (c.source_out_sec != null && c.source_out_sec <= c.source_in_sec) {
          errors.push(`clip ${c.id}: source_out_sec must be > source_in_sec`)
        }
      } else if (got === 'video') {
        if (c.timeline_start_sec < 0) errors.push(`clip ${c.id}: timeline_start_sec must be >= 0`)
        if (c.duration_sec <= 0) errors.push(`clip ${c.id}: duration_sec must be > 0`)
        if (c.source_in_sec < 0) errors.push(`clip ${c.id}: source_in_sec must be >= 0`)
        if (c.source_out_sec != null && c.source_out_sec <= c.source_in_sec) {
          errors.push(`clip ${c.id}: source_out_sec must be > source_in_sec`)
        }
        if (c.base_source === 'still_kenburns' && !c.kenburns) {
          errors.push(`clip ${c.id}: still_kenburns requires kenburns params`)
        }
      } else if (got === 'overlay') {
        if (c.timeline_start_sec < 0) errors.push(`clip ${c.id}: timeline_start_sec must be >= 0`)
        if (c.duration_sec <= 0) errors.push(`clip ${c.id}: duration_sec must be > 0`)
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
      const c = clip as any
      const type = c.type ?? 'audio'
      let clipEnd: number
      if (type === 'audio') {
        const end = c.source_out_sec ?? sourceDurations[c.id] ?? null
        clipEnd = end == null ? c.timeline_start_sec : c.timeline_start_sec + (end - c.source_in_sec)
      } else {
        clipEnd = c.timeline_start_sec + c.duration_sec
      }
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
    case 2:
      return state
    default:
      throw new Error(`Unsupported timeline schema_version: ${(state as any).schema_version}`)
  }
}

/** A blank AV project: Video + Overlay + VO + Music lanes, no clips. Pure. */
export function emptyAvTimeline(): TimelineState {
  return TimelineStateSchema.parse({
    schema_version: 2,
    media_type: 'av',
    tracks: [
      { id: 'video', name: 'Video', kind: 'video', clips: [] },
      { id: 'overlay', name: 'Overlay', kind: 'overlay', clips: [] },
      { id: 'vo', name: 'Voiceover', kind: 'voiceover', clips: [] },
      { id: 'music', name: 'Music', kind: 'music', clips: [] }
    ]
  })
}
