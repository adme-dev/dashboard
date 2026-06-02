import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, dbToGain } from '~~/app/utils/audio/audioSchedulePlanner'

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
