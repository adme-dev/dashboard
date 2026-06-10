import { describe, expect, it } from 'vitest'
import { isSamePreviewSourceUrl, resolveVideoPreviewState } from '~~/app/utils/video/videoPreviewState'

const baseClip = {
  type: 'video',
  id: 'clip-1',
  r2_key: 'clip.mp4',
  timeline_start_sec: 0,
  duration_sec: 5,
  base_source: 'uploaded_footage',
}

describe('resolveVideoPreviewState', () => {
  it('returns empty when no visual clip is active', () => {
    expect(resolveVideoPreviewState({
      clips: [],
      currentTime: 0,
      sources: {},
      mediaStatus: {},
    })).toEqual({ kind: 'empty' })
  })

  it('reports a missing source for the active clip', () => {
    expect(resolveVideoPreviewState({
      clips: [baseClip],
      currentTime: 1,
      sources: {},
      mediaStatus: {},
    })).toMatchObject({ kind: 'missing-source', clipId: 'clip-1', r2Key: 'clip.mp4' })
  })

  it('reports loading until the active source is decoded', () => {
    expect(resolveVideoPreviewState({
      clips: [baseClip],
      currentTime: 1,
      sources: { 'clip.mp4': '/stream' },
      mediaStatus: {},
    })).toMatchObject({ kind: 'loading', clipId: 'clip-1' })
  })

  it('reports ready or error from media decode status', () => {
    expect(resolveVideoPreviewState({
      clips: [baseClip],
      currentTime: 1,
      sources: { 'clip.mp4': '/stream' },
      mediaStatus: { 'clip-1': 'ready' },
    })).toMatchObject({ kind: 'ready', clipId: 'clip-1' })

    expect(resolveVideoPreviewState({
      clips: [baseClip],
      currentTime: 1,
      sources: { 'clip.mp4': '/stream' },
      mediaStatus: { 'clip-1': 'error' },
    })).toMatchObject({ kind: 'error', clipId: 'clip-1' })
  })
})

describe('isSamePreviewSourceUrl', () => {
  it('treats absolute browser media src and relative source-map URLs as the same source', () => {
    expect(isSamePreviewSourceUrl(
      'https://app.xeroflow.io/api/agency/video/assets/a1/stream',
      '/api/agency/video/assets/a1/stream',
      'https://app.xeroflow.io/agency/audio/projects/p1'
    )).toBe(true)
  })

  it('returns false for empty or different sources', () => {
    expect(isSamePreviewSourceUrl('', '/api/agency/video/assets/a1/stream')).toBe(false)
    expect(isSamePreviewSourceUrl('/api/agency/video/assets/a1/stream', '/api/agency/video/assets/a2/stream')).toBe(false)
  })
})
