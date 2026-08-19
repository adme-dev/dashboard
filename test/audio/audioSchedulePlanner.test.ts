import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, dbToGain, windowEvents } from '~~/app/utils/audio/audioSchedulePlanner'

function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('dbToGain', () => {
  it('converts decibels to linear amplitude', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501187, 5)
    expect(dbToGain(-Infinity)).toBe(0)
  })
})

describe('planTimeline — tracks', () => {
  it('emits one bus per non-muted track with its gain in dB', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: -2, clips: [] },
      { id: 'mus', name: 'M', kind: 'music', muted: true, clips: [] }
    ] })
    const plan = planTimeline(s)
    expect(plan.tracks).toEqual([{ trackId: 'vo', gainDb: -2 }])
  })
})

describe('planTimeline — clips', () => {
  it('flattens non-muted clips, sorted by timeline start, with resolved fields', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 10, source_out_sec: 20 } ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_in_sec: 1, source_out_sec: 6,
          gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] }
    ] })
    const plan = planTimeline(s)
    expect(plan.clips).toEqual([
      { clipId: 'a', trackId: 'vo', r2_key: 'k/a', timelineStartSec: 0, sourceInSec: 1,
        durationSec: 5, gainDb: -3, fadeInSec: 0.5, fadeOutSec: 1, fadeCurve: 'exp' },
      { clipId: 'b', trackId: 'mus', r2_key: 'k/b', timelineStartSec: 10, sourceInSec: 0,
        durationSec: 20, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
    ])
  })

  it('leaves durationSec null when source_out_sec is null, and skips muted tracks', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: null } ] },
      { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [
        { id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 5 } ] }
    ] })
    const plan = planTimeline(s)
    expect(plan.clips).toEqual([
      { clipId: 'b', trackId: 'mus', r2_key: 'k/b', timelineStartSec: 0, sourceInSec: 0,
        durationSec: null, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
    ])
    expect(plan.ramps).toEqual([])
  })
})

describe('planTimeline — ducking ramps', () => {
  it('emits a down ramp at each source-clip start and a restore at its end', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    // VO clip plays [2, 2+(5-0)=7); duck mus down at 2 over 0.05s, restore at 7 over 0.3s
    expect(planTimeline(s).ramps).toEqual([
      { targetTrackId: 'mus', atSec: 2, toGainDb: -12, rampSec: 0.05 },
      { targetTrackId: 'mus', atSec: 7, toGainDb: 0, rampSec: 0.3 }
    ])
  })

  it('emits only a down ramp when the source clip has null source_out_sec (restore filled by adapter)', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: null } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -10 }]
    })
    expect(planTimeline(s).ramps).toEqual([
      { targetTrackId: 'mus', atSec: 0, toGainDb: -10, rampSec: 0.05 }
    ])
  })

  it('skips a rule whose source or target track is muted/absent', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', muted: true, clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
    })
    expect(planTimeline(s).ramps).toEqual([])
  })
})

describe('windowEvents', () => {
  it('slices clips and ramps to [fromSec, toSec)', () => {
    const plan = planTimeline(tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 },
          { id: 'a2', r2_key: 'k/a2', timeline_start_sec: 10, source_out_sec: 12 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
    }))
    // window [0, 6): clips starting in [0,6) = a(0), b(0); ramps atSec in [0,6) =
    // a's down@0 AND a's restore@5 (clip a ends at 5, which is < 6 → in window)
    const w = windowEvents(plan, 0, 6)
    expect(w.clips.map((c) => c.clipId).sort()).toEqual(['a', 'b'])
    expect(w.ramps).toEqual([
      { targetTrackId: 'mus', atSec: 0, toGainDb: -12, rampSec: 0.05 },
      { targetTrackId: 'mus', atSec: 5, toGainDb: 0, rampSec: 0.3 }
    ])
    // window [6, 12): clip a2 (10); ramps: restore@5 is NOT in [6,12); a2 down@10 is
    const w2 = windowEvents(plan, 6, 12)
    expect(w2.clips.map((c) => c.clipId)).toEqual(['a2'])
    expect(w2.ramps).toEqual([{ targetTrackId: 'mus', atSec: 10, toGainDb: -12, rampSec: 0.05 }])
  })
})

import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

describe('planTimeline — AV clip kinds', () => {
  it('schedules audio clips but skips video and overlay clips', () => {
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 0, ducking: [],
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'video', id: 'v1', asset_id: null, r2_key: 'media/p/footage.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
        ] },
        { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
        ] },
        { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'audio', id: 'a1', asset_id: null, r2_key: 'audio/vo.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 3, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
        ] }
      ]
    } as unknown as TimelineState

    const plan = planTimeline(state)
    expect(plan.clips.map(c => c.clipId)).toEqual(['a1'])
  })

  it('schedules legacy audio clips that have no `type` field', () => {
    const state = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, ducking: [],
      tracks: [{ id: 'm', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { id: 'legacy', asset_id: null, r2_key: 'audio/m.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 2, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
      ] }]
    } as unknown as TimelineState
    expect(planTimeline(state).clips.map(c => c.clipId)).toEqual(['legacy'])
  })
})
