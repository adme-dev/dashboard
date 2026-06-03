import { describe, it, expect } from 'vitest'
import {
  cloneState,
  deleteClip,
  moveClip,
  type EditableState
} from '~~/app/utils/audio/timelineEdit'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const base: TimelineState = {
  schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
  tracks: [
    { id: 'trk-vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false,
      clips: [{ id: 'c1', asset_id: 'a1', r2_key: 'k1', timeline_start_sec: 0, source_in_sec: 0,
        source_out_sec: 5, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }] }
  ],
  ducking: []
}

describe('cloneState', () => {
  it('deep-clones (no shared refs) and recomputes duration_sec', () => {
    const out = cloneState(base)
    out.tracks[0].clips[0].timeline_start_sec = 99
    expect(base.tracks[0].clips[0].timeline_start_sec).toBe(0) // original untouched
    expect(cloneState(base).duration_sec).toBe(5)              // recomputed from clips
  })
})

describe('deleteClip', () => {
  it('removes the clip and recomputes duration', () => {
    const out = deleteClip(base, { clipId: 'c1' })
    expect(out.tracks[0].clips).toHaveLength(0)
    expect(out.duration_sec).toBe(0)
    expect(base.tracks[0].clips).toHaveLength(1) // input untouched
  })
  it('is a no-op for an unknown clip id', () => {
    expect(deleteClip(base, { clipId: 'nope' }).tracks[0].clips).toHaveLength(1)
  })
})

describe('moveClip', () => {
  function cloneStateForTest(): TimelineState {
    const s = structuredClone(base)
    s.tracks.push({ id: 'trk-mus', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] })
    return s
  }
  const two = cloneStateForTest()
  it('moves within a track and clamps start at 0', () => {
    const out = moveClip(two, { clipId: 'c1', toTrackId: 'trk-vo', newStartSec: -3 })
    expect(out.tracks[0].clips[0].timeline_start_sec).toBe(0)
  })
  it('moves a clip to a different track', () => {
    const out = moveClip(two, { clipId: 'c1', toTrackId: 'trk-mus', newStartSec: 2 })
    expect(out.tracks[0].clips).toHaveLength(0)
    expect(out.tracks[1].clips[0].id).toBe('c1')
    expect(out.tracks[1].clips[0].timeline_start_sec).toBe(2)
  })
})
