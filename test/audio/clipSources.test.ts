import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'

function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('collectClipKeys', () => {
  it('returns distinct clip r2_keys from non-muted tracks', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 },
        { id: 'a2', r2_key: 'k/a', timeline_start_sec: 6, source_out_sec: 9 } ] },           // dup key
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    expect(collectClipKeys(s).sort()).toEqual(['k/a', 'k/b'])
  })

  it('skips clips on muted tracks (the engine never requests their buffers)', () => {
    const s = tl({ tracks: [
      { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [
        { id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    expect(collectClipKeys(s)).toEqual(['k/b'])
  })

  it('returns an empty array for an empty timeline', () => {
    expect(collectClipKeys(tl({ tracks: [] }))).toEqual([])
  })
})
