import { describe, expect, it } from 'vitest'
import { resolveVideoStudioClipInspector } from '~~/app/utils/video/clipInspector'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const timeline: TimelineState = {
  schema_version: 2,
  media_type: 'av',
  sample_rate: 48000,
  fps: 30,
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 'video',
      name: 'Video',
      kind: 'video',
      clips: [
        { type: 'video', id: 'v1', asset_id: 'asset-1', r2_key: 'media/hero.mp4', timeline_start_sec: 2, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute', effects: ['film_grain'] },
      ],
    },
    {
      id: 'captions',
      name: 'Captions',
      kind: 'caption',
      clips: [
        { type: 'caption', id: 'cap1', timeline_start_sec: 1, duration_sec: 3, text: 'Drive away today', source_asset_id: 'asset-1', caption_vtt_url: null, style: 'bold_social' },
      ],
    },
  ],
  ducking: [],
}

describe('resolveVideoStudioClipInspector', () => {
  it('returns selected video clip timing and source details', () => {
    const summary = resolveVideoStudioClipInspector({ timeline, selectedClipId: 'v1' })

    expect(summary).toMatchObject({
      clipId: 'v1',
      kind: 'video',
      trackName: 'Video',
      label: 'Footage clip',
      sourceLabel: 'media/hero.mp4',
      startSec: 2,
      durationSec: 5,
      endSec: 7,
    })
    expect(summary?.details).toContainEqual({ label: 'Effects', value: '1' })
  })

  it('returns caption text and style details', () => {
    const summary = resolveVideoStudioClipInspector({ timeline, selectedClipId: 'cap1' })

    expect(summary).toMatchObject({ clipId: 'cap1', kind: 'caption', label: 'Caption clip' })
    expect(summary?.details).toContainEqual({ label: 'Text', value: 'Drive away today' })
    expect(summary?.details).toContainEqual({ label: 'Style', value: 'bold social' })
  })

  it('returns null when nothing is selected', () => {
    expect(resolveVideoStudioClipInspector({ timeline, selectedClipId: null })).toBeNull()
    expect(resolveVideoStudioClipInspector({ timeline, selectedClipId: 'missing' })).toBeNull()
  })
})
