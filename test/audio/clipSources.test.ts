import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

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

describe('collectClipKeys — AV', () => {
  it('includes video footage keys and excludes keyless overlay clips', () => {
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 0, ducking: [],
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'video', id: 'v1', asset_id: null, r2_key: 'media/p/footage.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
        ] },
        { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
        ] }
      ]
    } as unknown as TimelineState
    const keys = collectClipKeys(state)
    expect(keys).toEqual(['media/p/footage.mp4'])
    expect(keys).not.toContain(undefined)
  })
})
