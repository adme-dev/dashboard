import { describe, it, expect } from 'vitest'
import { cloneState, type EditableState } from '~~/app/utils/audio/timelineEdit'
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

import { deleteClip } from '~~/app/utils/audio/timelineEdit'
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
