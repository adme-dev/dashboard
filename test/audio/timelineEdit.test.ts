import { describe, it, expect } from 'vitest'
import {
  cloneState,
  deleteClip,
  moveClip,
  addClip,
  trimClip,
  sliceClipAt,
  snapTime,
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

describe('addClip', () => {
  it('appends a clip with the asset key and given id at the start time', () => {
    const out = addClip(base, { trackId: 'trk-vo', id: 'c2',
      asset: { id: 'a2', r2_key_master: 'k2' }, startSec: 4 })
    const added = out.tracks[0].clips.find(c => c.id === 'c2')!
    expect(added.r2_key).toBe('k2')
    expect(added.asset_id).toBe('a2')
    expect(added.timeline_start_sec).toBe(4)
    expect(added.source_out_sec).toBeNull() // play to end
  })
})

describe('trimClip', () => {
  it('trims the END, clamped to the source duration', () => {
    const out = trimClip(base, { clipId: 'c1', edge: 'end', newTimeSec: 3, sourceDurationSec: 5 })
    expect(out.tracks[0].clips[0].source_out_sec).toBe(3)
    // never past source length:
    const out2 = trimClip(base, { clipId: 'c1', edge: 'end', newTimeSec: 99, sourceDurationSec: 5 })
    expect(out2.tracks[0].clips[0].source_out_sec).toBe(5)
  })
  it('trims the START, advancing source_in and timeline_start together', () => {
    const out = trimClip(base, { clipId: 'c1', edge: 'start', newTimeSec: 2, sourceDurationSec: 5 })
    expect(out.tracks[0].clips[0].source_in_sec).toBe(2)
    expect(out.tracks[0].clips[0].timeline_start_sec).toBe(2)
  })
})

describe('sliceClipAt', () => {
  it('splits one clip into two at the playhead, ids supplied', () => {
    const out = sliceClipAt(base, { clipId: 'c1', timeSec: 2, leftId: 'L', rightId: 'R' })
    const clips = out.tracks[0].clips
    expect(clips.map(c => c.id)).toEqual(['L', 'R'])
    expect(clips[0].timeline_start_sec).toBe(0)
    expect(clips[0].source_out_sec).toBe(2)
    expect(clips[1].timeline_start_sec).toBe(2)
    expect(clips[1].source_in_sec).toBe(2)
  })
  it('is a no-op when the time is outside the clip', () => {
    expect(sliceClipAt(base, { clipId: 'c1', timeSec: 9, leftId: 'L', rightId: 'R' })
      .tracks[0].clips).toHaveLength(1)
  })
})

describe('snapTime', () => {
  it('snaps to the nearest target within the pixel threshold', () => {
    // 100 px/sec, 8px threshold → 0.08s window
    expect(snapTime(2.05, [2, 5], 100, 8)).toBe(2)      // within window
    expect(snapTime(2.5, [2, 5], 100, 8)).toBe(2.5)     // outside → unchanged
  })
})
