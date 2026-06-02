import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { buildTimelineFiltergraph as buildTs, buildMasterRenderArgs as argsTs } from '~~/server/utils/audio/timelineFiltergraph'
// @ts-expect-error — .mjs port, no types
import { buildTimelineFiltergraph as buildMjs, buildMasterRenderArgs as argsMjs } from '../../workers/audio-jobs/container/timelineFiltergraph.mjs'

const fixture = TimelineStateSchema.parse({
  tracks: [
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
      { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 1, source_out_sec: 6, gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] },
    { id: 'mus', name: 'M', kind: 'music', gain_db: -2, clips: [
      { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 },
      { id: 'c', r2_key: 'k/c', timeline_start_sec: 30, source_out_sec: 45 } ] }
  ],
  ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
})

describe('TS ↔ MJS filtergraph port parity', () => {
  it('produce identical filter_complex + master argv for a representative timeline', () => {
    const ts = buildTs(fixture)
    const mjs = buildMjs(fixture)
    expect(mjs.filterComplex).toBe(ts.filterComplex)
    expect(mjs.inputs).toEqual(ts.inputs)
    const paths = ts.inputs.map((_, i) => `/tmp/in${i}.wav`)
    expect(argsMjs(mjs, paths, '/tmp/m.wav')).toEqual(argsTs(ts, paths, '/tmp/m.wav'))
  })
})
