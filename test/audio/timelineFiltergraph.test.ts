import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { buildTimelineFiltergraph, curveToken } from '~~/server/utils/audio/timelineFiltergraph'

// Build a normalized TimelineState from a partial raw doc (relies on SP0 defaults).
function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('curveToken', () => {
  it('maps contract fade curves to ffmpeg afade curve tokens', () => {
    expect(curveToken('linear')).toBe('tri')
    expect(curveToken('exp')).toBe('exp')
    expect(curveToken('log')).toBe('log')
  })
})

describe('buildTimelineFiltergraph — inputs', () => {
  it('lists clip inputs in track-then-clip order with r2_key + clipId', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([
      { clipId: 'a', r2_key: 'k/a' },
      { clipId: 'b', r2_key: 'k/b' }
    ])
    expect(plan.sampleRate).toBe(48000)
    expect(plan.durationSec).toBe(30)
  })

  it('skips muted tracks entirely (no inputs, no chains)', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', muted: true, clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([{ clipId: 'b', r2_key: 'k/b' }])
    expect(plan.filterComplex).not.toContain('k/a')
  })
})

describe('buildTimelineFiltergraph — per-clip chain', () => {
  it('emits atrim+asetpts, adelay (ms), volume, and both fades with the curve token', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 1, source_out_sec: 6,
          gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    // input 0 → clip chain [c0]; aformat first (prior-art: every input before amix);
    // playLen = 6-1 = 5, fade-out starts at 5-1 = 4
    expect(fc).toContain('[0:a]aformat=sample_rates=48000:channel_layouts=stereo,'
      + 'atrim=start=1:end=6,asetpts=N/SR/TB,adelay=2000:all=1,volume=-3dB,'
      + 'afade=t=in:st=0:d=0.5:curve=exp,afade=t=out:st=4:d=1:curve=exp[c0]')
  })

  it('omits atrim end when source_out_sec is null, and skips zero gain/fades/delay', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: null } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    expect(fc).toContain('[0:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=0,asetpts=N/SR/TB[c0]')
    expect(fc).not.toContain('adelay')
    expect(fc).not.toContain('volume=')
    expect(fc).not.toContain('afade')
  })
})

describe('buildTimelineFiltergraph — per-track bus', () => {
  it('a single-clip, zero-gain track reuses the clip label as its bus', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    // one track, one clip, no gain → final mix is just the clip, always alimiter-guarded
    expect(plan.filterComplex).toContain('[c0]alimiter=limit=0.95[mix]')
  })

  it('amixes a multi-clip track (duration=longest) and applies track gain', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', gain_db: -2, clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 },
        { id: 'c', r2_key: 'k/c', timeline_start_sec: 10, source_out_sec: 20 } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    expect(fc).toContain('[c0][c1]amix=inputs=2:normalize=0:duration=longest,volume=-2dB[t0]')
  })
})
