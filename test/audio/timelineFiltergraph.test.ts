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

import { buildMasterRenderArgs, duckRatioFromAmountDb, duckThresholdLinear } from '~~/server/utils/audio/timelineFiltergraph'

describe('duckRatioFromAmountDb', () => {
  it('is a documented monotonic map from attenuation magnitude to sidechain ratio', () => {
    // ratio = clamp(round(1 + |amount_db|/3, 1dp), 1, 20). amount -12 → 1+4 = 5.
    expect(duckRatioFromAmountDb(-12)).toBe(5)
    expect(duckRatioFromAmountDb(-6)).toBe(3)
    expect(duckRatioFromAmountDb(0)).toBe(1)
    expect(duckRatioFromAmountDb(-100)).toBe(20) // clamped
  })
})

describe('duckThresholdLinear', () => {
  it('converts threshold_db to a clamped linear amplitude', () => {
    expect(duckThresholdLinear(-30)).toBe(0.031623)
    expect(duckThresholdLinear(0)).toBe(1)
    expect(duckThresholdLinear(-200)).toBe(0.000977) // clamped to ffmpeg min
  })
})

describe('buildTimelineFiltergraph — ducking', () => {
  it('splits the source bus and sidechain-compresses the target, then mixes', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [
        { id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12,
          attack_ms: 50, release_ms: 300, threshold_db: -30 } ]
    })
    const fc = buildTimelineFiltergraph(s).filterComplex
    // source bus c0 split → [c0] used in final mix + [sc0] feeds the sidechain key
    expect(fc).toContain('[c0]asplit=2[c0a][sc0]')
    // target bus c1 compressed keyed by [sc0]
    expect(fc).toContain('[c1][sc0]sidechaincompress=threshold=0.031623:ratio=5:attack=50:release=300[d0]')
    // final mix uses the post-split source [c0a] and the ducked target [d0], duration=longest + alimiter
    expect(fc).toContain('[c0a][d0]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[mix]')
  })
})

describe('buildTimelineFiltergraph — multi-rule ducking', () => {
  it('re-splits one source across two targets without label collision', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] },
        { id: 'sfx', name: 'S', kind: 'sfx', clips: [{ id: 'c', r2_key: 'k/c', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [
        { id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 },
        { id: 'd2', source_track_id: 'vo', target_track_id: 'sfx', amount_db: -9 }
      ]
    })
    const fc = buildTimelineFiltergraph(s).filterComplex
    expect(fc).toContain('[c0]asplit=2[c0a][sc0]')
    expect(fc).toContain('[c0a]asplit=2[c0aa][sc1]')
    expect(fc).toContain('[c1][sc0]sidechaincompress=threshold=0.031623:ratio=5:attack=50:release=300[d0]')
    expect(fc).toContain('[c2][sc1]sidechaincompress=threshold=0.031623:ratio=4:attack=50:release=300[d1]')
    expect(fc).toContain('[c0aa][d0][d1]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.95[mix]')
  })
})

describe('buildMasterRenderArgs', () => {
  it('assembles -i per input (in order), -filter_complex, -map [mix], wav out at sample_rate', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    const args = buildMasterRenderArgs(plan, ['/tmp/in0.wav'], '/tmp/master.wav')
    expect(args).toEqual([
      '-hide_banner', '-nostats',
      '-i', '/tmp/in0.wav',
      '-filter_complex', plan.filterComplex,
      '-map', '[mix]',
      '-ar', '48000',
      '-codec:a', 'pcm_s16le',
      '-y', '/tmp/master.wav'
    ])
  })

  it('throws when inputPaths length does not match plan.inputs', () => {
    const s = tl({ tracks: [ { id: 'm', name: 'M', kind: 'music', clips: [
      { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] } ] })
    const plan = buildTimelineFiltergraph(s)
    expect(() => buildMasterRenderArgs(plan, [], '/tmp/master.wav')).toThrow()
  })
})

describe('buildTimelineFiltergraph — empty timeline', () => {
  it('produces no inputs and an empty filter graph', () => {
    const s = tl({ tracks: [], ducking: [] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([])
    expect(plan.filterComplex).toBe('')
  })
})
