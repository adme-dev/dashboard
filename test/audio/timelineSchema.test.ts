import { describe, it, expect } from 'vitest'
import {
  TimelineStateSchema,
  validateTimeline,
  computeDuration,
  migrateTimeline,
  emptyAvTimeline,
  type TimelineState
} from '~~/server/utils/audio/timelineSchema'

// A minimal valid raw document (relies on schema defaults to normalize).
function rawTimeline(overrides: Record<string, any> = {}) {
  return {
    tracks: [
      { id: 't-vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'c1', r2_key: 'audio/org/a1/master.mp3', timeline_start_sec: 0, source_out_sec: 5 }
      ] },
      { id: 't-music', name: 'Music', kind: 'music', clips: [
        { id: 'c2', r2_key: 'audio/org/a2/master.mp3', timeline_start_sec: 0, source_out_sec: 30 }
      ] }
    ],
    ducking: [
      { id: 'd1', source_track_id: 't-vo', target_track_id: 't-music', amount_db: -12 }
    ],
    ...overrides
  }
}

describe('TimelineStateSchema (parse + defaults)', () => {
  it('parses a minimal document and applies defaults', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    expect(s.schema_version).toBe(1)
    expect(s.media_type).toBe('audio')
    expect(s.sample_rate).toBe(48000)
    expect(s.duration_sec).toBe(0)               // not yet computed
    const vo = s.tracks[0]
    expect(vo.gain_db).toBe(0)
    expect(vo.muted).toBe(false)
    expect(vo.locked).toBe(false)
    expect(vo.hidden).toBe(false)
    const clip = vo.clips[0]
    expect(clip.asset_id).toBeNull()
    expect(clip.source_in_sec).toBe(0)
    expect(clip.gain_db).toBe(0)
    expect(clip.fade_in_sec).toBe(0)
    expect(clip.fade_out_sec).toBe(0)
    expect(clip.fade_curve).toBe('linear')
    expect(s.ducking[0].attack_ms).toBe(50)
    expect(s.ducking[0].release_ms).toBe(300)
    expect(s.ducking[0].threshold_db).toBe(-30)
  })

  it('rejects a structurally malformed document (bad track kind)', () => {
    const bad = rawTimeline({ tracks: [{ id: 't1', name: 'x', kind: 'bogus', clips: [] }] })
    expect(TimelineStateSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a clip missing its r2_key', () => {
    const bad = rawTimeline()
    delete bad.tracks[0].clips[0].r2_key
    expect(TimelineStateSchema.safeParse(bad).success).toBe(false)
  })
})

describe('validateTimeline (referential + semantic integrity)', () => {
  it('accepts a valid normalized document', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    expect(validateTimeline(s)).toEqual({ ok: true })
  })

  it('rejects a ducking rule referencing a non-existent track', () => {
    const s = TimelineStateSchema.parse(rawTimeline({
      ducking: [{ id: 'd1', source_track_id: 't-vo', target_track_id: 't-missing', amount_db: -12 }]
    }))
    const r = validateTimeline(s)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.errors.join(' ')).toContain('t-missing')
  })

  it('rejects a ducking rule where source equals target', () => {
    const s = TimelineStateSchema.parse(rawTimeline({
      ducking: [{ id: 'd1', source_track_id: 't-vo', target_track_id: 't-vo', amount_db: -12 }]
    }))
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a clip with a negative timeline_start_sec', () => {
    const raw = rawTimeline()
    raw.tracks[0].clips[0].timeline_start_sec = -1
    const s = TimelineStateSchema.parse(raw)
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a clip with source_out_sec <= source_in_sec', () => {
    const raw = rawTimeline()
    raw.tracks[0].clips[0].source_in_sec = 5
    raw.tracks[0].clips[0].source_out_sec = 5
    const s = TimelineStateSchema.parse(raw)
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects duplicate track ids', () => {
    const raw = rawTimeline()
    raw.tracks[1].id = 't-vo'
    const s = TimelineStateSchema.parse(raw)
    const r = validateTimeline(s)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.errors.join(' ')).toContain('track')
  })

  it('rejects duplicate clip ids within a track', () => {
    const raw = rawTimeline()
    raw.tracks[0].clips.push({ id: 'c1', r2_key: 'audio/org/a3/master.mp3', timeline_start_sec: 6, source_out_sec: 8 })
    const s = TimelineStateSchema.parse(raw)
    expect(validateTimeline(s).ok).toBe(false)
  })
})

describe('computeDuration', () => {
  it('returns the max clip end across resolvable clips', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    // music clip: start 0 + (30 - 0) = 30 is the max
    expect(computeDuration(s)).toBe(30)
  })

  it('honours timeline_start_sec offset and source_in_sec trim', () => {
    const raw = rawTimeline()
    raw.tracks[0].clips[0] = { id: 'c1', r2_key: 'k', timeline_start_sec: 10, source_in_sec: 2, source_out_sec: 7 }
    raw.tracks[1].clips = [] // drop the 30s music clip
    const s = TimelineStateSchema.parse(raw)
    // 10 + (7 - 2) = 15
    expect(computeDuration(s)).toBe(15)
  })

  it('uses caller-supplied source durations for null source_out_sec clips', () => {
    const raw = rawTimeline()
    raw.tracks[1].clips = [{ id: 'c2', r2_key: 'k', timeline_start_sec: 0, source_out_sec: null }]
    raw.tracks[0].clips = [{ id: 'c1', r2_key: 'k', timeline_start_sec: 0, source_out_sec: 5 }]
    const s = TimelineStateSchema.parse(raw)
    // without the resolver, c2 contributes only its start (0); max is c1 = 5
    expect(computeDuration(s)).toBe(5)
    // with the resolver, c2 = 0 + 12 = 12 wins
    expect(computeDuration(s, { c2: 12 })).toBe(12)
  })

  it('returns 0 for an empty timeline', () => {
    const s = TimelineStateSchema.parse(rawTimeline({ tracks: [], ducking: [] }))
    expect(computeDuration(s)).toBe(0)
  })
})

describe('migrateTimeline', () => {
  it('is the identity for a v1 document', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    const migrated = migrateTimeline(s)
    expect(migrated).toEqual(s)
  })

  it('throws on an unknown future schema_version', () => {
    const s = { ...TimelineStateSchema.parse(rawTimeline()), schema_version: 99 } as unknown as TimelineState
    expect(() => migrateTimeline(s)).toThrow()
  })
})

describe('AV timeline (schema_version 2) parse', () => {
  function rawAv(overrides: Record<string, any> = {}) {
    return {
      schema_version: 2,
      media_type: 'av',
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', clips: [
          { type: 'video', id: 'v1', r2_key: 'media/org/f1.mp4', timeline_start_sec: 0, duration_sec: 8, base_source: 'uploaded_footage' },
          { type: 'video', id: 'v2', r2_key: 'media/org/s1.jpg', timeline_start_sec: 8, duration_sec: 5, base_source: 'still_kenburns', kenburns: { zoom_from: 1, zoom_to: 1.2 } }
        ] },
        { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 13, gsap_project_id: 'banner-123' }
        ] },
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'c1', r2_key: 'audio/org/a1.mp3', timeline_start_sec: 0, source_out_sec: 13 }
        ] }
      ],
      ...overrides
    }
  }

  it('parses an AV document and applies defaults', () => {
    const s = TimelineStateSchema.parse(rawAv())
    expect(s.schema_version).toBe(2)
    expect(s.media_type).toBe('av')
    expect(s.fps).toBe(30)
    expect(s.width).toBe(1080)
    expect(s.height).toBe(1920)
    const vid = s.tracks[0]
    expect(vid.kind).toBe('video')
    expect((vid.clips[0] as any).type).toBe('video')
    expect((vid.clips[0] as any).audio_mode).toBe('mute')
    expect((vid.clips[1] as any).base_source).toBe('still_kenburns')
    expect((s.tracks[1].clips[0] as any).opacity).toBe(1)
  })

  it('treats an audio clip with no explicit type as type "audio"', () => {
    const s = TimelineStateSchema.parse(rawAv())
    const voClip = s.tracks[2].clips[0] as any
    expect(voClip.type).toBe('audio')
    expect(voClip.gain_db).toBe(0)
  })
})

describe('Backward compatibility (schema_version 1 audio unchanged)', () => {
  it('parses a v1 audio document exactly as before', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    expect(s.schema_version).toBe(1)
    expect(s.media_type).toBe('audio')
    expect(s.fps).toBe(30)
    const clip = s.tracks[0].clips[0] as any
    expect(clip.type).toBe('audio')
    expect(clip.fade_curve).toBe('linear')
  })
})

describe('validateTimeline (AV semantics)', () => {
  const baseAv = () => TimelineStateSchema.parse({
    schema_version: 2, media_type: 'av',
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', clips: [
        { type: 'video', id: 'v1', r2_key: 'm/f.mp4', timeline_start_sec: 0, duration_sec: 5, base_source: 'uploaded_footage' }
      ] },
      { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1' }
      ] }
    ]
  })

  it('accepts a well-formed AV timeline', () => {
    expect(validateTimeline(baseAv()).ok).toBe(true)
  })

  it('rejects a clip whose type does not match its track kind', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).type = 'overlay'
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a still_kenburns video clip with no kenburns params', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).base_source = 'still_kenburns'
    ;(s.tracks[0].clips[0] as any).kenburns = null
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a non-positive duration_sec on a video/overlay clip', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).duration_sec = 0
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a video clip with negative source_in_sec', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).source_in_sec = -1
    const r = validateTimeline(s)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.errors.join(' ')).toContain('source_in_sec')
  })

  it('rejects a video clip with source_out_sec <= source_in_sec', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).source_in_sec = 3
    ;(s.tracks[0].clips[0] as any).source_out_sec = 3
    const r = validateTimeline(s)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.errors.join(' ')).toContain('source_out_sec')
  })
})

describe('computeDuration (AV)', () => {
  it('uses timeline_start + duration_sec for video/overlay clips', () => {
    const s = TimelineStateSchema.parse({
      schema_version: 2, media_type: 'av',
      tracks: [
        { id: 'vid', name: 'V', kind: 'video', clips: [
          { type: 'video', id: 'v1', r2_key: 'm/f.mp4', timeline_start_sec: 10, duration_sec: 5, base_source: 'uploaded_footage' }
        ] },
        { id: 'ovl', name: 'O', kind: 'overlay', clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 8, gsap_project_id: 'b1' }
        ] }
      ]
    })
    expect(computeDuration(s)).toBe(15)
  })
})

describe('migrateTimeline + emptyAvTimeline', () => {
  it('passes through schema_version 2 unchanged', () => {
    const s = emptyAvTimeline()
    expect(migrateTimeline(s)).toEqual(s)
  })
  it('still passes through schema_version 1', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    expect(migrateTimeline(s).schema_version).toBe(1)
  })
  it('emptyAvTimeline seeds a valid AV project with Video/Overlay/VO/Music lanes', () => {
    const s = emptyAvTimeline()
    expect(s.schema_version).toBe(2)
    expect(s.media_type).toBe('av')
    expect(s.tracks.map(t => t.kind)).toEqual(['video', 'overlay', 'voiceover', 'music'])
    expect(validateTimeline(s).ok).toBe(true)
  })
})

describe('OverlayClip gsap_format_key', () => {
  it('parses an overlay clip with a gsap_format_key and defaults it when absent', () => {
    const s = TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
      { id: 'ovl', name: 'O', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story' },
        { type: 'overlay', id: 'o2', timeline_start_sec: 5, duration_sec: 5, gsap_project_id: 'b1' }
      ] }
    ] })
    expect((s.tracks[0].clips[0] as any).gsap_format_key).toBe('fb_story')
    expect((s.tracks[0].clips[1] as any).gsap_format_key).toBeNull()  // default null → resolver picks by aspect
  })
})
