import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan as ts, buildCompositeRenderArgs as tsArgs } from '~~/server/utils/audio/videoCompositeGraph'
// @ts-expect-error — .mjs port, no types
import { buildCompositePlan as mjs, buildCompositeRenderArgs as mjsArgs } from '../../workers/audio-jobs/container/videoCompositeGraph.mjs'

const profile = videoFormatFor('reels_9x16')!
function av() {
  return TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
    { id: 'vid', name: 'V', kind: 'video', clips: [
      { type: 'video', id: 'f1', r2_key: 'm/f.mp4', timeline_start_sec: 0, duration_sec: 5, base_source: 'uploaded_footage' }
    ] },
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
      { id: 'a1', r2_key: 'a/vo.mp3', timeline_start_sec: 0, source_out_sec: 5 }
    ] }
  ] })
}
describe('videoCompositeGraph .ts ↔ .mjs parity', () => {
  it('produces identical plans', () => {
    expect(mjs(av(), profile)).toEqual(ts(av(), profile))
  })
  it('produces identical args', () => {
    const p = ts(av(), profile)
    expect(mjsArgs(p, ['a', 'b'], 'o.mp4')).toEqual(tsArgs(p, ['a', 'b'], 'o.mp4'))
  })
})
