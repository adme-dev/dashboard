import { describe, expect, it } from 'vitest'
import { canUseTimelineStillProject, canUseVideoGenerationProject, findTimelineStillSource } from '~~/server/utils/video-generation/timelineStillSource'

const state = {
  tracks: [
    {
      id: 'audio',
      kind: 'audio',
      clips: [{ id: 'audio-still', base_source: 'still_kenburns', r2_key: 'media/p/audio.png' }],
    },
    {
      id: 'video',
      kind: 'video',
      clips: [
        { id: 'still-1', base_source: 'still_kenburns', r2_key: 'media/p/still.png' },
        { id: 'footage-1', base_source: 'uploaded_footage', r2_key: 'media/p/clip.mp4' },
        { id: 'still-missing-key', base_source: 'still_kenburns' },
      ],
    },
  ],
}

describe('findTimelineStillSource', () => {
  it('finds only still_kenburns clips on video tracks with an R2 key', () => {
    expect(findTimelineStillSource(state, 'still-1')).toEqual({ r2Key: 'media/p/still.png' })
    expect(findTimelineStillSource(state, 'footage-1')).toBeNull()
    expect(findTimelineStillSource(state, 'audio-still')).toBeNull()
    expect(findTimelineStillSource(state, 'still-missing-key')).toBeNull()
  })

  it('handles missing or malformed timeline state', () => {
    expect(findTimelineStillSource(null, 'still-1')).toBeNull()
    expect(findTimelineStillSource({ tracks: null }, 'still-1')).toBeNull()
  })
})

describe('canUseTimelineStillProject', () => {
  it('allows project creators and admin roles', () => {
    expect(canUseTimelineStillProject({ id: 'u1', role: 'editor' }, { createdBy: 'u1' })).toBe(true)
    expect(canUseTimelineStillProject({ id: 'admin-1', role: 'admin' }, { createdBy: 'u2' })).toBe(true)
    expect(canUseTimelineStillProject({ id: 'owner-1', role: 'owner' }, { createdBy: 'u2' })).toBe(true)
  })

  it('rejects non-admin users who did not create the project', () => {
    expect(canUseTimelineStillProject({ id: 'u1', role: 'editor' }, { createdBy: 'u2' })).toBe(false)
    expect(canUseTimelineStillProject({ id: 'u1', role: 'editor' }, { createdBy: null })).toBe(false)
  })
})

describe('canUseVideoGenerationProject', () => {
  it('uses the same creator/admin access rule for cost-bearing generation routes', () => {
    expect(canUseVideoGenerationProject({ id: 'u1', role: 'editor' }, { createdBy: 'u1' })).toBe(true)
    expect(canUseVideoGenerationProject({ id: 'owner-1', role: 'owner' }, { createdBy: 'u2' })).toBe(true)
    expect(canUseVideoGenerationProject({ id: 'u1', role: 'editor' }, { createdBy: 'u2' })).toBe(false)
  })
})
