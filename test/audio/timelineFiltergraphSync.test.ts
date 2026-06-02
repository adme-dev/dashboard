import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { buildTimelineFiltergraph as buildTs, buildMasterRenderArgs as argsTs } from '~~/server/utils/audio/timelineFiltergraph'
// @ts-expect-error — .mjs port, no types
import { buildTimelineFiltergraph as buildMjs, buildMasterRenderArgs as argsMjs } from '../../workers/audio-jobs/container/timelineFiltergraph.mjs'

const fixtures: Record<string, any> = {
  'representative (ducking + multi-clip + gains/fades)': {
    tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 1, source_out_sec: 6, gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] },
      { id: 'mus', name: 'M', kind: 'music', gain_db: -2, clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 },
        { id: 'c', r2_key: 'k/c', timeline_start_sec: 30, source_out_sec: 45 } ] }
    ],
    ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
  },
  'muted track skipped': {
    tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', muted: true, clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
      { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
    ], ducking: []
  },
  'empty active track between reals + single-clip track gain (anull)': {
    tracks: [
      { id: 'a', name: 'A', kind: 'music', gain_db: -4, clips: [{ id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 10 }] },
      { id: 'empty', name: 'E', kind: 'sfx', clips: [] },
      { id: 'b', name: 'B', kind: 'music', clips: [{ id: 'y', r2_key: 'k/y', timeline_start_sec: 5, source_out_sec: 12 }] }
    ], ducking: []
  },
  'null source_out_sec (no atrim end, no fade-out)': {
    tracks: [{ id: 'm', name: 'M', kind: 'music', clips: [
      { id: 'z', r2_key: 'k/z', timeline_start_sec: 0, source_out_sec: null, fade_in_sec: 0.3, fade_out_sec: 2 } ] }], ducking: []
  },
  'multi-rule ducking (one source, two targets)': {
    tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
      { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] },
      { id: 'sfx', name: 'S', kind: 'sfx', clips: [{ id: 'c', r2_key: 'k/c', timeline_start_sec: 0, source_out_sec: 30 }] }
    ],
    ducking: [
      { id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 },
      { id: 'd2', source_track_id: 'vo', target_track_id: 'sfx', amount_db: -9 }
    ]
  }
}

describe('TS ↔ MJS filtergraph port parity', () => {
  for (const [name, raw] of Object.entries(fixtures)) {
    it(`identical TS/MJS output: ${name}`, () => {
      const s = TimelineStateSchema.parse(raw)
      const ts = buildTs(s)
      const mjs = buildMjs(s)
      expect(mjs.filterComplex).toBe(ts.filterComplex)
      expect(mjs.inputs).toEqual(ts.inputs)
      expect(mjs.durationSec).toBe(ts.durationSec)
      const paths = ts.inputs.map((_: any, i: number) => `/tmp/in${i}.wav`)
      expect(argsMjs(mjs, paths, '/tmp/m.wav')).toEqual(argsTs(ts, paths, '/tmp/m.wav'))
    })
  }
})
